import { z } from "zod";
import type { Person } from "./projects";

/** Days after a contract ends to write a review; also when unrevealed ones become visible. */
export const REVIEW_WINDOW_DAYS = 14;

export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(10).max(1000),
});
export type ReviewInput = z.input<typeof reviewInput>;

export interface ReviewView {
  id: string;
  rating: number;
  comment: string;
  author: Person;
  createdAt: string;
  /** Which project it was about (absent for the seeded marketplace's history). */
  project: { id: string; title: string } | null;
}

/** How a person is rated on one side (as a freelancer, or as a client). Revealed reviews only. */
export interface Reputation {
  count: number;
  /** Plain average, null with no reviews. */
  average: number | null;
}

/** For the two people of a finished contract. */
export interface ContractReviews {
  /** Writing is possible (a party, contract completed, window open, not written yet). */
  canReview: boolean;
  /** When the window closes (null until the contract is completed). */
  closesAt: string | null;
  mine: ReviewView | null;
  /** The other side's review, once revealed (both wrote, or the window closed). */
  theirs: ReviewView | null;
  /** The other side already wrote one, still hidden. */
  theirsWaiting: boolean;
}

/** Weight of the Bayesian prior: every person starts with this many imaginary reviews at the mean. */
export const BAYESIAN_WEIGHT = 5;

/**
 * Ranking by rating without rewarding a lucky few: every person starts with `weight` imaginary reviews
 * at the marketplace's mean, so one 5-star review doesn't beat fifty 4.8s. (Search computes the same in
 * SQL; its tests hold the two together.)
 */
export function bayesian(
  { count, average }: Reputation,
  { mean, weight = BAYESIAN_WEIGHT }: { mean: number; weight?: number },
): number {
  return (weight * mean + count * (average ?? 0)) / (weight + count);
}
