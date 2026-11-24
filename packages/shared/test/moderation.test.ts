import { describe, expect, it } from "vitest";
import { emailPreferences, reportInput, unsubscribeCategory } from "../src";

describe("reports and email preferences", () => {
  it("take a known target and reason; empty details are none", () => {
    const id = "01a20000-0000-7000-8000-000000000001";
    expect(
      reportInput.parse({ targetType: "review", targetId: id, reason: "offensive", details: "  " }),
    ).toEqual({
      targetType: "review",
      targetId: id,
      reason: "offensive",
      details: null,
    });
    expect(reportInput.safeParse({ targetType: "contract", targetId: id, reason: "spam" }).success).toBe(
      false,
    );
    expect(reportInput.safeParse({ targetType: "project", targetId: "x", reason: "spam" }).success).toBe(
      false,
    );
    expect(
      reportInput.safeParse({
        targetType: "project",
        targetId: id,
        reason: "spam",
        details: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });

  it("need every category, and read an unsubscribe link's category", () => {
    expect(emailPreferences.safeParse({ proposals: true }).success).toBe(false);
    const body = btoa("01a20000-0000-7000-8000-000000000001:reviews")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(unsubscribeCategory(`${body}.signature`)).toBe("reviews");
    expect(unsubscribeCategory("not-base64!.x")).toBeNull();
    expect(unsubscribeCategory(`${btoa("id:account")}.x`)).toBeNull();
  });
});
