import type { Page, PublicClient, ReviewView } from "@lance/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ProfileHeader,
  ProfileSkeleton,
  Section,
  Unavailable,
  memberSince,
  place,
} from "@/components/profile-page";
import { ReportButton } from "@/components/report-button";
import { ReviewList } from "@/components/review-list";
import { ReputationLine } from "@/components/stars";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Cliente" };

export default function ClientPage({ params }: PageProps<"/clientes/[id]">) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Suspense fallback={<ProfileSkeleton />}>
        <Client params={params} />
      </Suspense>
    </main>
  );
}

async function Client({ params }: { params: PageProps<"/clientes/[id]">["params"] }) {
  const { id } = await params;
  const [result, reviews] = await Promise.all([
    serverGet<PublicClient>(`/clients/${encodeURIComponent(id)}`),
    serverGet<Page<ReviewView>>(`/clients/${encodeURIComponent(id)}/reviews`),
  ]);
  if (result.status === "not_found") notFound();
  if (result.status === "unavailable") return <Unavailable />;
  const profile = result.data;
  return (
    <article className="grid gap-8">
      <ProfileHeader
        name={profile.name}
        title={profile.company}
        facts={["Cliente", place(profile.city, profile.state), memberSince(profile.memberSince)]}
      />
      {profile.about ? (
        <Section title="Sobre">
          <p className="leading-relaxed whitespace-pre-line text-stone-800">{profile.about}</p>
        </Section>
      ) : null}
      <Section title="Avaliações">
        <p className="text-sm">
          <ReputationLine reputation={profile.reputation} />
        </p>
        <ReviewList
          reviews={reviews.status === "ok" ? reviews.data.items : []}
          empty="Nenhum freelancer avaliou este cliente ainda."
        />
      </Section>
      <ReportButton
        targetType="profile"
        targetId={profile.id}
        ownerId={profile.id}
        className="justify-self-start"
      />
    </article>
  );
}
