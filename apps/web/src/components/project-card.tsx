import { categoryLabel, skillLabel, type ProjectSummary } from "@lance/shared";
import Link from "next/link";
import { ago, budget, plural } from "@/lib/format";

/** A project in a list. */
export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <article className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">
          <Link href={`/projetos/${project.id}`} className="hover:text-indigo-700">
            {project.title}
          </Link>
        </h2>
        <p className="text-sm text-stone-500">
          {project.client.company ?? project.client.name} · {categoryLabel(project.category)}
          {project.publishedAt ? ` · publicado ${ago(project.publishedAt)}` : ""}
        </p>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Habilidades">
        {project.skills.map((skill) => (
          <li key={skill} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm text-stone-700">
            {skillLabel(skill)}
          </li>
        ))}
      </ul>
      <p className="flex flex-wrap gap-x-4 text-sm">
        <span className="font-medium text-stone-900">
          {budget(project.budgetMinCents, project.budgetMaxCents)}
        </span>
        <span className="text-stone-500">{plural(project.proposalCount, "proposta", "propostas")}</span>
      </p>
    </article>
  );
}
