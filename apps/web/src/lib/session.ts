"use client";

import type { Me } from "@lance/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api, ApiFailure } from "./api";

export const ME_KEY = ["me"] as const;

/** The signed-in account, or null. One request per page load, shared by every component. */
export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async () => (await api<{ me: Me | null }>("/session")).me,
    staleTime: 60_000,
    retry: (count, error) => !(error instanceof ApiFailure && error.status < 500) && count < 4,
    retryDelay: (attempt) => Math.min(2000 * 2 ** attempt, 15_000),
  });
}

/** For pages that need a session: sends the visitor to sign in and back here afterwards. */
export function useRequireMe(): Me | null {
  const { data, isPending } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (!isPending && data === null) {
      router.replace(`/entrar?next=${encodeURIComponent(location.pathname + location.search)}`);
    }
  }, [data, isPending, router]);
  return data ?? null;
}

/** After signing in, out or changing the account: everyone reading `useMe` sees the new value. */
export function useSetMe() {
  const client = useQueryClient();
  return (me: Me | null) => {
    client.setQueryData(ME_KEY, me);
    if (me === null) client.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
  };
}

/** Where to go after signing in: the page that asked, if it's one of ours. */
export function nextPath(fallback = "/painel"): string {
  const next = new URLSearchParams(location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Reads and erases the token in the URL fragment (#t=…), so it doesn't linger in the address bar. */
export function takeFragmentToken(): string | null {
  const token = new URLSearchParams(location.hash.slice(1)).get("t");
  if (token) history.replaceState(null, "", location.pathname + location.search);
  return token;
}

/** Sign-in and sign-up pages: someone already signed in goes straight to the dashboard. */
export function useRedirectSignedIn() {
  const { data } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (data) router.replace(nextPath());
  }, [data, router]);
}
