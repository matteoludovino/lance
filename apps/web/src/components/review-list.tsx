import type { ReviewView } from "@lance/shared";
import Link from "next/link";
import { ago } from "@/lib/format";
import { ReportButton } from "./report-button";
import { Stars } from "./stars";

export function ReviewItem({ review }: { review: ReviewView }) {
  return (
    <article className="grid gap-1.5 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Stars rating={review.rating} size="text-sm" />
        <span className="text-xs text-stone-500">{ago(review.createdAt)}</span>
      </div>
      <p className="leading-relaxed text-stone-800">{review.comment}</p>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-sm text-stone-500">
          {review.author.name}
          {review.project ? (
            <>
              {" · "}
              <Link href={`/projetos/${review.project.id}`} className="hover:underline">
                {review.project.title}
              </Link>
            </>
          ) : null}
        </p>
        <ReportButton
          targetType="review"
          targetId={review.id}
          ownerId={review.author.id}
          label="Denunciar"
          className="text-xs"
        />
      </div>
    </article>
  );
}

export function ReviewList({ reviews, empty }: { reviews: ReviewView[]; empty: string }) {
  if (reviews.length === 0) return <p className="text-stone-600">{empty}</p>;
  return (
    <div className="grid gap-3">
      {reviews.map((review) => (
        <ReviewItem key={review.id} review={review} />
      ))}
    </div>
  );
}
