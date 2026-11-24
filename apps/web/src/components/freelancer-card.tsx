import { categoryLabel, formatBRL, skillLabel, type FreelancerCard as Card } from "@lance/shared";
import Link from "next/link";
import { initials, place } from "./profile-page";
import { ReputationLine } from "./stars";

/** A freelancer in search results. */
export function FreelancerCard({ freelancer }: { freelancer: Card }) {
  const where = place(freelancer.city, freelancer.state);
  return (
    <article className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid size-11 shrink-0 place-items-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-800"
        >
          {initials(freelancer.name)}
        </span>
        <div className="grid min-w-0 gap-0.5">
          <h2 className="text-lg font-semibold">
            <Link href={`/freelancers/${freelancer.id}`} className="hover:text-indigo-700">
              {freelancer.name}
            </Link>
          </h2>
          <p className="text-stone-700">{freelancer.headline}</p>
          <p className="text-sm text-stone-500">
            {categoryLabel(freelancer.category)}
            {where ? ` · ${where}` : ""}
          </p>
        </div>
      </div>
      <p className="text-sm">
        <ReputationLine reputation={freelancer.reputation} />
      </p>
      <ul className="flex flex-wrap gap-1.5" aria-label="Habilidades">
        {freelancer.skills.map((skill) => (
          <li key={skill} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm text-stone-700">
            {skillLabel(skill)}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-medium text-stone-900">A partir de {formatBRL(freelancer.minBudgetCents)}</span>
        <span className={freelancer.available ? "text-emerald-700" : "text-stone-500"}>
          {freelancer.available ? "Disponível" : "Agenda cheia"}
        </span>
      </p>
    </article>
  );
}
