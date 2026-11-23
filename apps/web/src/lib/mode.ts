"use client";

import { useSyncExternalStore } from "react";

/** Which side of the marketplace the interface shows. Only a view: the API checks ownership itself. */
export type Mode = "client" | "freelancer";

const KEY = "lance:mode";
const listeners = new Set<() => void>();

function read(): Mode {
  try {
    return localStorage.getItem(KEY) === "freelancer" ? "freelancer" : "client";
  } catch {
    return "client";
  }
}

export function setMode(mode: Mode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Private mode without storage: the switch still works until the page reloads.
  }
  current = mode;
  for (const listener of listeners) listener();
}

let current: Mode | null = null;

export function useMode(): Mode {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (current ??= read()),
    () => "client",
  );
}
