"use client";

import type { Me } from "@lance/shared";
import type { ReactNode } from "react";
import { RequireSession } from "@/components/require-session";
import { Notice } from "@/components/ui/notice";

/** Admin pages: signed in, and an admin (the API checks again on every request). */
export function AdminOnly({ children }: { children: (me: Me) => ReactNode }) {
  return (
    <RequireSession>
      {(me) =>
        me.role === "admin" ? (
          children(me)
        ) : (
          <main className="mx-auto max-w-5xl px-4 py-10">
            <Notice tone="error">Esta área é só para administradores.</Notice>
          </main>
        )
      }
    </RequireSession>
  );
}
