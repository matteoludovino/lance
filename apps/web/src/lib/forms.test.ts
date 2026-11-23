import { describe, expect, it } from "vitest";
import { freelancerProfileInput, signupInput } from "@lance/shared";
import { validate } from "./forms";

describe("validate", () => {
  it("returns parsed data when valid", () => {
    expect(validate(signupInput, { name: "Ana", email: "ANA@X.COM", password: "12345678" })).toEqual({
      data: { name: "Ana", email: "ana@x.com", password: "12345678" },
      errors: null,
    });
  });

  it("explains each field in Portuguese", () => {
    expect(validate(signupInput, { name: "", email: "ana", password: "123" }).errors).toEqual({
      name: "Preencha este campo.",
      email: "Digite um e-mail válido.",
      password: "Use pelo menos 8 caracteres.",
    });
    expect(
      validate(freelancerProfileInput, {
        headline: "Dev",
        bio: "x".repeat(20),
        category: "design",
        skills: [],
        minBudgetCents: 10_000,
        available: true,
      }).errors,
    ).toEqual({ headline: "Use pelo menos 5 caracteres.", skills: "Escolha pelo menos uma." });
  });
});
