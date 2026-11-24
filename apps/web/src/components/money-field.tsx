"use client";

import { formatBRL, parseBRL } from "@lance/shared";
import type { ComponentProps } from "react";
import { TextField } from "./ui/field";

/** Centavos as people type them ("1.500" or "1.500,50"). Empty or unreadable is null. */
export function readMoney(text: string): number | null {
  return text.trim() === "" ? null : parseBRL(text);
}

/** What goes in the box for an amount we already have. */
export function moneyText(cents: number | null | undefined): string {
  return cents == null
    ? ""
    : formatBRL(cents)
        .replace(/^R\$\s*/, "")
        .replace(/,00$/, "");
}

export function MoneyField(props: Omit<ComponentProps<typeof TextField>, "inputMode">) {
  return <TextField inputMode="decimal" placeholder="0,00" {...props} />;
}
