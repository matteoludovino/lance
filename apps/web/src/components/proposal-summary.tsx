import { PROPOSAL_STATUS_LABELS, type ProposalView } from "@lance/shared";
import { money, plural } from "@/lib/format";

const TONES: Record<ProposalView["status"], string> = {
  submitted: "bg-indigo-50 text-indigo-800",
  accepted: "bg-emerald-50 text-emerald-800",
  declined: "bg-stone-100 text-stone-600",
  withdrawn: "bg-stone-100 text-stone-600",
};

export function StatusBadge({ status }: { status: ProposalView["status"] }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${TONES[status]}`}>
      {PROPOSAL_STATUS_LABELS[status]}
    </span>
  );
}

/** A proposal's price, deadline, milestones and letter. */
export function ProposalSummary({ proposal }: { proposal: ProposalView }) {
  return (
    <div className="grid gap-4">
      <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-xl font-semibold">{money(proposal.priceCents)}</span>
        <span className="text-sm text-stone-600">em {plural(proposal.deliveryDays, "dia", "dias")}</span>
      </p>
      <ol className="grid gap-1.5 text-sm">
        {proposal.milestones.map((milestone, index) => (
          <li key={index} className="flex justify-between gap-4 border-b border-stone-100 pb-1.5">
            <span>
              <span className="text-stone-500">{index + 1}.</span> {milestone.title}
            </span>
            <span className="font-medium whitespace-nowrap">{money(milestone.amountCents)}</span>
          </li>
        ))}
      </ol>
      <p className="leading-relaxed whitespace-pre-line text-stone-700">{proposal.coverLetter}</p>
    </div>
  );
}
