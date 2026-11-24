import type { ProjectDetail } from "@lance/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProfileSkeleton, Unavailable } from "@/components/profile-page";
import { ProjectForm } from "@/components/project-form";
import { Notice } from "@/components/ui/notice";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Editar projeto" };

export default function EditProjectPage({ params }: PageProps<"/projetos/[id]/editar">) {
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Editar projeto</h1>
      <Suspense fallback={<ProfileSkeleton />}>
        <Edit params={params} />
      </Suspense>
    </main>
  );
}

async function Edit({ params }: { params: PageProps<"/projetos/[id]/editar">["params"] }) {
  const { id } = await params;
  const result = await serverGet<ProjectDetail>(`/projects/${encodeURIComponent(id)}`);
  if (result.status === "not_found") notFound();
  if (result.status === "unavailable") return <Unavailable />;
  const project = result.data;
  if (!project.isOwner) notFound();
  if (project.status !== "draft" && project.status !== "open") {
    return <Notice tone="info">Este projeto não pode mais ser editado.</Notice>;
  }
  return <ProjectForm project={project} />;
}
