import { describe, expect, it } from "vitest";
import {
  CATEGORY_SLUGS,
  SKILLS,
  bayesian,
  formatBRL,
  freelancerProfileInput,
  parseBRL,
  projectInput,
  proposalInput,
  proposalPrice,
  signupInput,
} from "../src";

describe("catalog", () => {
  it("has unique skill slugs, each in a known category", () => {
    expect(new Set(SKILLS.map((skill) => skill.slug)).size).toBe(SKILLS.length);
    for (const skill of SKILLS) expect(CATEGORY_SLUGS).toContain(skill.category);
  });
});

describe("money", () => {
  it("formats centavos as reais", () => {
    expect(formatBRL(123456).replace(/\s/g, " ")).toBe("R$ 1.234,56");
    expect(formatBRL(5).replace(/\s/g, " ")).toBe("R$ 0,05");
  });

  it("parses what people type, exactly", () => {
    expect(parseBRL("1.234,56")).toBe(123456);
    expect(parseBRL("R$ 50")).toBe(5000);
    expect(parseBRL("0,1")).toBe(10);
    expect(parseBRL("1234")).toBe(123400);
    expect(parseBRL("1.234.567")).toBe(123456700);
    for (const bad of ["", "abc", "1,234", "12.34", "1,2,3", "-5", "1.23,00"])
      expect(parseBRL(bad)).toBeNull();
  });
});

describe("account input", () => {
  it("normalizes email and name", () => {
    expect(
      signupInput.parse({ name: "  Ana   Souza ", email: " Ana@Exemplo.COM ", password: "12345678" }),
    ).toEqual({
      name: "Ana Souza",
      email: "ana@exemplo.com",
      password: "12345678",
    });
  });

  it("rejects short passwords and bad emails", () => {
    expect(signupInput.safeParse({ name: "Ana", email: "ana@x.com", password: "1234567" }).success).toBe(
      false,
    );
    expect(signupInput.safeParse({ name: "Ana", email: "ana", password: "12345678" }).success).toBe(false);
  });
});

describe("freelancer profile input", () => {
  const valid = {
    headline: "Desenvolvedora React",
    bio: "Faço aplicações web com React e Next.js há seis anos.",
    category: "desenvolvimento",
    skills: ["react", "nextjs"],
    minBudgetCents: 150_000,
    available: true,
  };

  it("accepts a complete profile and fills in an empty location", () => {
    expect(freelancerProfileInput.parse(valid)).toMatchObject({ city: null, state: null });
  });

  it("rejects unknown or repeated skills", () => {
    expect(freelancerProfileInput.safeParse({ ...valid, skills: ["cobol"] }).success).toBe(false);
    expect(freelancerProfileInput.safeParse({ ...valid, skills: ["react", "react"] }).success).toBe(false);
  });
});

describe("project and proposal input", () => {
  const project = {
    title: "Loja virtual para torrefação",
    description: "Precisamos de uma loja Shopify com frete por CEP e assinatura mensal de café.",
    category: "desenvolvimento",
    skills: ["shopify"],
    budgetMinCents: 300_000,
    budgetMaxCents: 600_000,
  };

  it("needs the budget range in order", () => {
    expect(projectInput.safeParse(project).success).toBe(true);
    const reversed = projectInput.safeParse({ ...project, budgetMinCents: 700_000 });
    expect(reversed.success).toBe(false);
    expect(reversed.error?.issues[0]?.path).toEqual(["budgetMaxCents"]);
  });

  it("prices a proposal as the sum of its milestones", () => {
    const proposal = proposalInput.parse({
      coverLetter: "Já fiz quatro lojas de café e conheço bem o frete por CEP.",
      deliveryDays: 20,
      milestones: [
        { title: "Tema e catálogo", amountCents: 250_000 },
        { title: "Frete e assinatura", amountCents: 200_050 },
      ],
    });
    expect(proposalPrice(proposal.milestones)).toBe(450_050);
    expect(proposalInput.safeParse({ ...proposal, milestones: [] }).success).toBe(false);
  });
});

describe("bayesian ranking", () => {
  it("doesn't let one perfect review beat many very good ones", () => {
    const mean = 4.2;
    const lucky = bayesian({ count: 1, average: 5 }, { mean });
    const steady = bayesian({ count: 50, average: 4.8 }, { mean });
    expect(steady).toBeGreaterThan(lucky);
    expect(bayesian({ count: 0, average: null }, { mean })).toBe(mean);
    expect(bayesian({ count: 1000, average: 3 }, { mean })).toBeCloseTo(3, 1);
  });
});
