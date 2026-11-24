import type { EmailCategory } from "@lance/shared";

/**
 * Which category an email kind belongs to; null for email people can't turn off (their account,
 * moderation notices).
 */
export function categoryOf(kind: string): EmailCategory | null {
  if (kind.startsWith("proposal_")) return "proposals";
  if (kind.startsWith("milestone_")) return "contracts";
  if (kind.startsWith("review")) return "reviews";
  if (kind.startsWith("message_")) return "messages";
  return null;
}
