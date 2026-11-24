import { formatBRL } from "@lance/shared";

/** "R$ 4.000" for whole reais, "R$ 4.000,50" otherwise. */
export function money(cents: number): string {
  const full = formatBRL(cents);
  return cents % 100 === 0 ? full.replace(/,00$/, "") : full;
}

export function budget(min: number, max: number): string {
  return min === max ? money(min) : `${money(min)} a ${money(max)}`;
}

const relative = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

/** "hoje", "ontem", "há 3 dias", "há 2 meses". */
export function ago(iso: string, now = Date.now()): string {
  const days = Math.round((new Date(iso).getTime() - now) / 86_400_000);
  if (days > -1) return "hoje";
  if (days > -30) return relative.format(days, "day");
  return relative.format(Math.round(days / 30), "month");
}

export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
