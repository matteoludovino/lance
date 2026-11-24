import { call, newEmail, otherPerson, signUp, expect, test } from "./helpers";

/** A made-up word only this run uses (the e2e database keeps earlier runs' data). */
const word = () =>
  "marcenaria" +
  Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("");

test("search: words without accents, facets that apply at once, and the freelancer list", async ({
  page: client,
  browser,
}) => {
  const unique = word();
  await signUp(client, "Helena Duarte", newEmail("helena"));
  await call(client, "PUT", "/me/client-profile", { company: "Ateliê Duarte" });
  await call(client, "POST", "/projects", {
    title: `Catálogo online da ${unique}`,
    description: "Um catálogo com fotos, medidas e pedido de orçamento pelo próprio site.",
    category: "desenvolvimento",
    skills: ["wordpress"],
    budgetMinCents: 200_000,
    budgetMaxCents: 400_000,
    publish: true,
  });

  // Typed without accents, found with them.
  const visitor = await otherPerson(browser);
  await visitor.goto("/projetos");
  await expect(visitor.getByRole("heading", { name: "Projetos recebendo propostas" })).toBeVisible();
  await visitor
    .getByRole("searchbox", { name: "Buscar" })
    .filter({ visible: true })
    .fill(`catalogo ${unique}`);
  await visitor.getByRole("searchbox", { name: "Buscar" }).filter({ visible: true }).press("Enter");
  await expect(visitor).toHaveURL(/q=catalogo/);
  const results = visitor.getByRole("region", { name: "Resultados" }).filter({ visible: true });
  await expect(results.getByText("1 projeto aberto")).toBeVisible();
  await expect(results.getByRole("link", { name: `Catálogo online da ${unique}` })).toBeVisible();

  // The category list counts its results; picking one applies at once (here: none in Design).
  const category = visitor
    .getByRole("combobox", { name: "Categoria", exact: true })
    .filter({ visible: true });
  await expect(category.locator("option", { hasText: "Desenvolvimento (1)" })).toHaveCount(1);
  await category.selectOption("design");
  await expect(visitor).toHaveURL(/category=design/);
  await expect(
    visitor
      .getByRole("region", { name: "Resultados" })
      .filter({ visible: true })
      .getByText("Nada encontrado"),
  ).toBeVisible();

  // A freelancer, found by what they do, with their reputation, and their page one click away.
  const freelancer = await otherPerson(browser);
  await signUp(freelancer, "Otávio Nunes", newEmail("otavio"));
  await call(freelancer, "PUT", "/me/freelancer-profile", {
    headline: `Tradução técnica e ${unique}`,
    bio: "Traduzo manuais e catálogos do inglês para o português há dez anos.",
    category: "redacao",
    skills: ["traducao-en", "revisao"],
    minBudgetCents: 40_000,
    available: true,
  });
  await client.goto(`/freelancers?q=${encodeURIComponent(`traducao ${unique}`)}`);
  const people = client.getByRole("region", { name: "Resultados" }).filter({ visible: true });
  await expect(people.getByText("1 freelancer")).toBeVisible();
  await expect(people.getByText("Sem avaliações ainda")).toBeVisible();
  await people.getByRole("link", { name: "Otávio Nunes" }).click();
  await expect(client.getByRole("heading", { name: "Otávio Nunes" })).toBeVisible();
});
