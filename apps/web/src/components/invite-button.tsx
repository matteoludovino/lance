"use client";

import type { ProjectSummary } from "@lance/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ApiFailure } from "@/lib/api";
import { useMe } from "@/lib/session";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Select } from "./ui/field";
import { Notice } from "./ui/notice";

/** On a freelancer's page: a client invites them to talk about one of their open projects. */
export function InviteButton({ freelancerId, name }: { freelancerId: string; name: string }) {
  const { data: me } = useMe();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { data: projects } = useQuery({
    queryKey: ["me", "projects"],
    queryFn: () => api<ProjectSummary[]>("/me/projects"),
    enabled: Boolean(me?.client) && me?.id !== freelancerId,
  });
  const openProjects = projects?.filter((project) => project.status === "open") ?? [];
  if (!me?.client || me.id === freelancerId || openProjects.length === 0) return null;

  async function invite() {
    setBusy(true);
    setFailure(null);
    try {
      const { conversationId } = await api<{ conversationId: string }>(`/projects/${projectId}/invite`, {
        body: { freelancerId },
      });
      router.push(`/mensagens/${conversationId}`);
    } catch (error) {
      setFailure(error instanceof ApiFailure ? error.message : "Não foi possível convidar.");
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setProjectId(openProjects[0]!.id);
          setOpen(true);
        }}
      >
        Convidar para um projeto
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Convidar ${name.split(" ")[0]}`}>
        <p className="text-stone-700">Abre uma conversa sobre o projeto; a proposta continua sendo dela.</p>
        {failure ? <Notice tone="error">{failure}</Notice> : null}
        <Select label="Projeto" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          {openProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </Select>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Voltar
          </Button>
          <Button busy={busy} onClick={invite}>
            Abrir conversa
          </Button>
        </div>
      </Dialog>
    </>
  );
}
