import { z } from "zod";
import { CATEGORY_SLUGS, SKILL_SLUGS, STATES } from "./catalog";
import { cents } from "./money";
import type { Reputation } from "./reviews";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .default(null);

export const location = z.object({
  city: optionalText(60),
  state: z.enum(STATES).nullable().default(null),
});

/** The client side of an account: who is hiring. */
export const clientProfileInput = z.object({
  company: optionalText(80),
  about: optionalText(1000),
  ...location.shape,
});
export type ClientProfileInput = z.input<typeof clientProfileInput>;

/** The freelancer side of an account: what they do, for how much, and whether they're taking work. */
export const freelancerProfileInput = z.object({
  headline: z.string().trim().min(5).max(80),
  bio: z.string().trim().min(20).max(2000),
  category: z.enum(CATEGORY_SLUGS),
  skills: z
    .array(z.enum(SKILL_SLUGS))
    .min(1)
    .max(12)
    .refine((skills) => new Set(skills).size === skills.length, { message: "repeated skill" }),
  /** "Projects from R$ …": the smallest budget they take (no hourly contracts here). */
  minBudgetCents: cents.min(5_000).max(10_000_000),
  available: z.boolean(),
  ...location.shape,
});
export type FreelancerProfileInput = z.input<typeof freelancerProfileInput>;

export interface Location {
  city: string | null;
  state: string | null;
}

export interface ClientProfile extends Location {
  company: string | null;
  about: string | null;
}

export interface FreelancerProfile extends Location {
  headline: string;
  bio: string;
  category: string;
  skills: string[];
  minBudgetCents: number;
  available: boolean;
}

/** `GET /api/me`: the signed-in account, both of its sides (either may be missing). */
export interface Me {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  emailVerified: boolean;
  /** Set for demo accounts: everything they write stays in their sandbox. */
  demo: boolean;
  client: ClientProfile | null;
  freelancer: FreelancerProfile | null;
}

/** A public page: never the email. */
export interface PublicFreelancer extends FreelancerProfile {
  id: string;
  name: string;
  memberSince: string;
  reputation: Reputation;
}

export interface PublicClient extends ClientProfile {
  id: string;
  name: string;
  memberSince: string;
  reputation: Reputation;
}
