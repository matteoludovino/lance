import type { PublicClient } from "@lance/shared";
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
  const result = await serverGet<PublicClient>(`/clients/${encodeURIComponent(id)}`);
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
    </article>
  );
}
