import { categoryLabel, skillLabel, type PublicFreelancer } from "@lance/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  Budget,
  ProfileHeader,
  ProfileSkeleton,
  Section,
  Unavailable,
  memberSince,
  place,
} from "@/components/profile-page";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Freelancer" };

export default function FreelancerPage({ params }: PageProps<"/freelancers/[id]">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<ProfileSkeleton />}>
        <Freelancer params={params} />
      </Suspense>
    </main>
  );
}

async function Freelancer({ params }: { params: PageProps<"/freelancers/[id]">["params"] }) {
  const { id } = await params;
  const result = await serverGet<PublicFreelancer>(`/freelancers/${encodeURIComponent(id)}`);
  if (result.status === "not_found") notFound();
  if (result.status === "unavailable") return <Unavailable />;
  const profile = result.data;
  return (
    <article className="grid gap-8">
      <ProfileHeader
        name={profile.name}
        title={profile.headline}
        facts={[
          categoryLabel(profile.category),
          place(profile.city, profile.state),
          memberSince(profile.memberSince),
        ]}
      />
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm shadow-sm">
        <span className="font-medium text-stone-900">
          <Budget cents={profile.minBudgetCents} />
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 font-medium ${profile.available ? "bg-emerald-50 text-emerald-800" : "bg-stone-100 text-stone-600"}`}
        >
          {profile.available ? "Disponível para novos projetos" : "Agenda cheia no momento"}
        </span>
      </div>
      <Section title="Sobre">
        <p className="leading-relaxed whitespace-pre-line text-stone-800">{profile.bio}</p>
      </Section>
      <Section title="Habilidades">
        <ul className="flex flex-wrap gap-1.5">
          {profile.skills.map((skill) => (
            <li key={skill} className="rounded-full bg-stone-100 px-3 py-1 text-sm text-stone-700">
              {skillLabel(skill)}
            </li>
          ))}
        </ul>
      </Section>
    </article>
  );
}
