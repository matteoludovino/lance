import { describe, expect, it } from "vitest";
import { freelancerFilters, projectFilters } from "../src";

describe("search filters", () => {
  it("read a plain GET form: empty fields are no filter", () => {
    expect(
      projectFilters.parse({ q: "", category: "", skills: "", minBudget: "", maxBudget: "", sort: "" }),
    ).toEqual({ skills: [] });
    expect(freelancerFilters.parse({ budget: "", minRating: "", available: "" })).toEqual({ skills: [] });
  });

  it("take one skill or several, without repeats", () => {
    expect(projectFilters.parse({ skills: "react" }).skills).toEqual(["react"]);
    expect(projectFilters.parse({ skills: ["react", "figma", "react"] }).skills).toEqual(["react", "figma"]);
    expect(projectFilters.safeParse({ skills: ["cobol"] }).success).toBe(false);
    expect(
      projectFilters.safeParse({ skills: ["react", "figma", "seo", "node", "php", "python"] }).success,
    ).toBe(false);
  });

  it("turn typed numbers into numbers and reject the rest", () => {
    expect(projectFilters.parse({ minBudget: "1500", q: "  loja  " })).toEqual({
      skills: [],
      minBudget: 1500,
      q: "loja",
    });
    expect(freelancerFilters.parse({ minRating: "4.5", available: "1" })).toMatchObject({
      minRating: 4.5,
      available: true,
    });
    for (const bad of [{ minBudget: "-1" }, { minBudget: "abc" }, { sort: "random" }, { q: "x".repeat(101) }])
      expect(projectFilters.safeParse(bad).success).toBe(false);
    expect(freelancerFilters.safeParse({ minRating: "6" }).success).toBe(false);
    expect(freelancerFilters.safeParse({ available: "no" }).success).toBe(false);
  });
});
