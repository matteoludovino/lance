"use client";

import { ProjectForm } from "@/components/project-form";
import { RequireSession } from "@/components/require-session";
import { ButtonLink } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export function NewProject() {
  return (
    <RequireSession>
      {(me) => (
        <main className="mx-auto grid max-w-3xl gap-6 px-4 py-10">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Publicar um projeto</h1>
            <p className="text-stone-600">
              Freelancers respondem com um preço dividido em etapas. Você paga cada etapa só quando aprovar a
              entrega.
            </p>
          </div>
          {me.client ? (
            <ProjectForm />
          ) : (
            <Notice tone="info">
              <p className="mb-3">Antes de publicar, conte rapidamente quem está contratando.</p>
              <ButtonLink href="/perfil/editar#cliente">Criar perfil de cliente</ButtonLink>
            </Notice>
          )}
        </main>
      )}
    </RequireSession>
  );
}
