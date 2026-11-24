import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { REVIEW_WINDOW_DAYS, type ContractReviews, type Page, type ReviewView } from "@lance/shared";
import type { AuthUser } from "../auth/auth-user.ts";
import { uuidv7 } from "../common/ids.ts";
import { isUniqueViolation, transaction } from "../common/transactions.ts";
import type { Prisma, ReviewRole } from "../generated/prisma/client.ts";
import { OutboxService } from "../outbox/outbox.service.ts";
import { PrismaService } from "../prisma/prisma.service.ts";
import { visibleTo } from "../sandbox/scope.ts";
import { Clock } from "../time/clock.ts";
import { revealedAbout } from "./reputation.ts";

const WINDOW_MS = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const PAGE = 10;
const CONTRACT_NOT_FOUND = { code: "not_found", message: "Contrato não encontrado." };

export const REVIEW_EVENTS = {
  /** A contract was completed: invite both sides to review. */
  requested: "reviews.requested",
  /** Both sides wrote: tell them their reviews are visible. */
  revealed: "reviews.revealed",
  /** Due when the window closes: a lone review becomes visible (and its subject is told). */
  windowClosed: "reviews.window_closed",
} as const;

const include = {
  author: { select: { id: true, name: true } },
  contract: { select: { project: { select: { id: true, title: true } } } },
} satisfies Prisma.ReviewInclude;

type Row = Prisma.ReviewGetPayload<{ include: typeof include }>;

/** Reviews: written once by each side of a completed contract, revealed when both are in or time is up. */
@Injectable()
export class Reviews {
  constructor(
    private readonly db: PrismaService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
  ) {}

  async write(
    user: AuthUser,
    contractId: string,
    input: { rating: number; comment: string },
  ): Promise<ReviewView> {
    let id: string;
    try {
      id = await transaction(this.db, async (tx) => {
        // The contract's lock orders the two reviews: only the second one sees both and announces it.
        await tx.$queryRaw`SELECT id FROM contracts WHERE id = ${contractId}::uuid FOR UPDATE`;
        const contract = await tx.contract.findUnique({ where: { id: contractId } });
        if (!contract || (contract.clientId !== user.id && contract.freelancerId !== user.id)) {
          throw new NotFoundException(CONTRACT_NOT_FOUND);
        }
        if (contract.status !== "completed" || !contract.completedAt) {
          throw new ConflictException({
            code: "not_reviewable",
            message: "As avaliações abrem quando o contrato termina com pelo menos uma etapa paga.",
          });
        }
        const now = this.clock.now();
        if (now.getTime() >= contract.completedAt.getTime() + WINDOW_MS) {
          throw new ConflictException({
            code: "review_window_closed",
            message: "O prazo para avaliar terminou.",
          });
        }
        const isClient = contract.clientId === user.id;
        const reviewId = uuidv7(now.getTime());
        await tx.review.create({
          data: {
            id: reviewId,
            contractId,
            authorId: user.id,
            revieweeId: isClient ? contract.freelancerId : contract.clientId,
            revieweeRole: isClient ? "freelancer" : "client",
            rating: input.rating,
            comment: input.comment,
            sandboxId: contract.sandboxId,
            createdAt: now,
          },
        });
        if ((await tx.review.count({ where: { contractId } })) === 2) {
          await this.outbox.add(
            tx,
            REVIEW_EVENTS.revealed,
            { contractId },
            { sandboxId: contract.sandboxId },
          );
        }
        return reviewId;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({ code: "already_reviewed", message: "Você já avaliou este contrato." });
      }
      throw error;
    }
    this.outbox.committed();
    return view(await this.db.review.findUniqueOrThrow({ where: { id }, include }));
  }

  async forContract(user: AuthUser, contractId: string): Promise<ContractReviews> {
    const contract = await this.db.contract.findUnique({ where: { id: contractId } });
    if (!contract || (contract.clientId !== user.id && contract.freelancerId !== user.id)) {
      throw new NotFoundException(CONTRACT_NOT_FOUND);
    }
    const now = this.clock.now();
    const reviews = await this.db.review.findMany({ where: { contractId, hiddenAt: null }, include });
    const mine = reviews.find((review) => review.authorId === user.id) ?? null;
    const theirs = reviews.find((review) => review.authorId !== user.id) ?? null;
    const closesAt = contract.completedAt ? new Date(contract.completedAt.getTime() + WINDOW_MS) : null;
    const closed = closesAt !== null && now >= closesAt;
    const revealed = closed || (mine !== null && theirs !== null);
    return {
      canReview: contract.status === "completed" && closesAt !== null && !closed && mine === null,
      closesAt: closesAt?.toISOString() ?? null,
      mine: mine && view(mine),
      theirs: theirs && revealed ? view(theirs) : null,
      theirsWaiting: theirs !== null && !revealed,
    };
  }

  /** Revealed reviews about a person on one side, newest first, for their public page. */
  async about(
    viewer: AuthUser | null,
    userId: string,
    role: ReviewRole,
    cursor?: string,
  ): Promise<Page<ReviewView>> {
    const reviewee = await this.db.user.findFirst({
      where: { id: userId, suspendedAt: null, ...visibleTo(viewer) },
      select: { id: true, sandboxId: true },
    });
    if (!reviewee) throw new NotFoundException({ code: "not_found", message: "Perfil não encontrado." });
    const rows = await this.db.review.findMany({
      where: {
        revieweeId: userId,
        revieweeRole: role,
        hiddenAt: null,
        // Only the reviewee's own corner of the marketplace, as in their average.
        sandboxId: reviewee.sandboxId,
        ...revealedAbout(userId, this.clock.now()),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include,
      orderBy: { id: "desc" },
      take: PAGE + 1,
    });
    const items = rows.slice(0, PAGE);
    return { items: items.map(view), next: rows.length > PAGE ? items.at(-1)!.id : null };
  }
}

function view(review: Row): ReviewView {
  return {
    id: review.id,
    rating: review.rating,
    comment: review.comment,
    author: review.author,
    createdAt: review.createdAt.toISOString(),
    project: review.contract?.project ?? null,
  };
}
