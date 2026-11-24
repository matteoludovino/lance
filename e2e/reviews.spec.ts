import { call, field, newEmail, otherPerson, signUp, expect, test } from "./helpers";

/** The visible star a person clicks (its radio button is visually hidden). */
const star = (page: import("@playwright/test").Page, name: string) =>
  page.locator("label", { has: page.getByRole("radio", { name }) });

test("double-blind reviews: hidden until both sides wrote, then on the public page", async ({
  page: client,
  browser,
}) => {
  // A contract carried to the end, through the API.
  await signUp(client, "Helena Duarte", newEmail("helena"));
  await call(client, "PUT", "/me/client-profile", { company: "Café da Serra" });
  const project = await call(client, "POST", "/projects", {
    title: "Rótulos para cafés especiais",
    description: "Três rótulos para pacotes de 250 g, prontos para a gráfica.",
    category: "design",
    skills: ["ilustracao"],
    budgetMinCents: 100_000,
    budgetMaxCents: 200_000,
    publish: true,
  });
  const freelancer = await otherPerson(browser);
  await signUp(freelancer, "Pedro Rocha", newEmail("pedro"));
  const me = await call(freelancer, "PUT", "/me/freelancer-profile", {
    headline: "Ilustração e embalagens",
    bio: "Ilustro embalagens e livros para pequenas marcas.",
    category: "design",
    skills: ["ilustracao"],
    minBudgetCents: 50_000,
    available: true,
  });
  const proposal = await call(freelancer, "POST", `/projects/${project.id}/proposals`, {
    coverLetter: "Faço os três rótulos com a faca especial e as provas de cor.",
    deliveryDays: 10,
    milestones: [{ title: "Três rótulos", amountCents: 150_000 }],
  });
  const { contractId } = await call(client, "POST", `/proposals/${proposal.id}/accept`, { version: 1 });
  const [milestone] = (await (await client.request.get(`/api/contracts/${contractId}`)).json()).milestones;
  await call(client, "POST", `/milestones/${milestone.id}/fund`);
  await call(freelancer, "POST", `/milestones/${milestone.id}/submit`, { note: "Arquivos finais enviados." });
  await call(client, "POST", `/milestones/${milestone.id}/approve`);

  // The client reviews first: nobody else sees it yet.
  await client.goto(`/contratos/${contractId}`);
  await star(client, "4 — Muito bom").click();
  await field(client, "Comentário").fill("Rótulos lindos; precisou de uma rodada extra de cores.");
  await client.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(client.getByText("Sua avaliação de Pedro Rocha")).toBeVisible();

  await freelancer.goto(`/freelancers/${me.id}`);
  await expect(freelancer.getByText("Sem avaliações ainda")).toBeVisible();
  await freelancer.goto(`/contratos/${contractId}`);
  await expect(freelancer.getByText("Helena já avaliou você")).toBeVisible();
  await star(freelancer, "5 — Excelente").click();
  await field(freelancer, "Comentário").fill("Briefing claro e pagamento no dia da aprovação.");
  await freelancer.getByRole("button", { name: "Enviar avaliação" }).click();
  await expect(freelancer.getByText("O que Helena Duarte disse sobre você")).toBeVisible();
  await expect(freelancer.getByText("Rótulos lindos; precisou de uma rodada extra de cores.")).toBeVisible();

  // Both in: the freelancer's public page shows it, in the average.
  const visitor = await otherPerson(browser);
  await visitor.goto(`/freelancers/${me.id}`);
  await expect(visitor.getByText("Rótulos lindos; precisou de uma rodada extra de cores.")).toBeVisible();
  await expect(visitor.getByText("· 1 avaliação")).toBeVisible();
});
