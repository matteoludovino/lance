import { call, grantAdmin, newEmail, otherPerson, signUp, expect, test } from "./helpers";

const unique = () => Math.random().toString(36).slice(2, 8);

test("a report reaches the admin, who hides the project from everyone", async ({ page: client, browser }) => {
  const run = unique();
  const title = `Logotipo e cartão de visita ${run}`;
  const details = `Pediu pagamento adiantado por Pix antes do contrato (${run}).`;
  await signUp(client, "Helena Duarte", newEmail("helena"));
  await call(client, "PUT", "/me/client-profile", { company: "Ateliê Duarte" });
  const project = await call(client, "POST", "/projects", {
    title,
    description: "Logotipo novo e um cartão de visita para o ateliê, com duas propostas de cor.",
    category: "design",
    skills: ["identidade-visual"],
    budgetMinCents: 80_000,
    budgetMaxCents: 150_000,
    publish: true,
  });

  // Someone reports it from the project page.
  const reporter = await otherPerson(browser);
  await signUp(reporter, "Otávio Nunes", newEmail("otavio"));
  await reporter.goto(`/projetos/${project.id}`);
  await reporter.getByRole("button", { name: "Denunciar projeto" }).click();
  const dialog = reporter.getByRole("dialog", { name: "Denunciar projeto" });
  await dialog.getByRole("radio", { name: "Golpe ou fraude" }).check();
  await dialog.getByLabel("Detalhes (opcional)").fill(details);
  await dialog.getByRole("button", { name: "Enviar denúncia" }).click();
  await expect(dialog.getByText("Recebemos sua denúncia")).toBeVisible();

  // The admin finds it, reads it, and hides the project.
  const moderator = await otherPerson(browser);
  const adminEmail = newEmail("admin");
  await signUp(moderator, "Equipe Lance", adminEmail);
  grantAdmin(adminEmail);
  await moderator.goto("/admin");
  await expect(moderator.getByRole("heading", { name: "Administração" })).toBeVisible();
  await moderator.getByRole("link", { name: title }).click();
  // (The list stays mounted, hidden, behind the report's page: look at what's visible.)
  await expect(moderator.getByText(details).filter({ visible: true })).toBeVisible();
  await moderator.getByLabel("Nota interna (opcional)").fill(`Golpe confirmado (${run}).`);
  await moderator.getByRole("button", { name: "Ocultar conteúdo" }).click();
  await moderator.getByRole("dialog").getByRole("button", { name: "Ocultar conteúdo" }).click();
  await expect(moderator.getByText(/Resolvida com ação · conteúdo ocultado/)).toBeVisible();

  // Gone for everyone else; the decision is on the record.
  await reporter.goto(`/projetos/${project.id}`);
  await expect(reporter.getByRole("heading", { name: "Não encontrado" })).toBeVisible();
  await moderator.goto("/admin");
  await moderator.getByRole("tab", { name: "Auditoria" }).click();
  await expect(moderator.getByText(`“Golpe confirmado (${run}).”`)).toBeVisible();
});

test("a dispute is decided by an admin, and the money follows", async ({ page: client, browser }) => {
  await signUp(client, "Helena Duarte", newEmail("helena"));
  await call(client, "PUT", "/me/client-profile", { company: "Ateliê Duarte" });
  const project = await call(client, "POST", "/projects", {
    title: `Site do ateliê ${unique()}`,
    description: "Um site simples com galeria, contato e a agenda de cursos do ateliê.",
    category: "desenvolvimento",
    skills: ["wordpress"],
    budgetMinCents: 200_000,
    budgetMaxCents: 400_000,
    publish: true,
  });
  const freelancer = await otherPerson(browser);
  await signUp(freelancer, "Marina Costa", newEmail("marina"));
  await call(freelancer, "PUT", "/me/freelancer-profile", {
    headline: "Sites WordPress para pequenos negócios",
    bio: "Faço sites WordPress rápidos e fáceis de manter há oito anos.",
    category: "desenvolvimento",
    skills: ["wordpress"],
    minBudgetCents: 100_000,
    available: true,
  });
  const proposal = await call(freelancer, "POST", `/projects/${project.id}/proposals`, {
    coverLetter: "Monto o site com tema leve, galeria e agenda, e treino vocês para atualizar.",
    deliveryDays: 15,
    milestones: [{ title: "Site completo", amountCents: 300_000 }],
  });
  const { contractId } = await call(client, "POST", `/proposals/${proposal.id}/accept`, { version: 1 });
  const [milestone] = (await (await client.request.get(`/api/contracts/${contractId}`)).json()).milestones;
  await call(client, "POST", `/milestones/${milestone.id}/fund`);
  await call(freelancer, "POST", `/milestones/${milestone.id}/submit`, {
    note: "Site no ar no endereço combinado.",
  });
  await call(client, "POST", `/milestones/${milestone.id}/dispute`, {
    reason: "A agenda de cursos não foi feita, e era o principal do projeto.",
  });

  const moderator = await otherPerson(browser);
  const adminEmail = newEmail("admin");
  await signUp(moderator, "Equipe Lance", adminEmail);
  grantAdmin(adminEmail);
  await moderator.goto("/admin");
  await moderator.getByRole("tab", { name: "Disputas" }).click();
  const dispute = moderator.getByRole("article").filter({ hasText: "A agenda de cursos não foi feita" });
  await dispute.getByRole("button", { name: "Reembolsar o cliente" }).click();
  await moderator.getByRole("dialog").getByRole("button", { name: "Reembolsar" }).click();
  await expect(dispute).toHaveCount(0);

  const after = await (await client.request.get(`/api/contracts/${contractId}`)).json();
  expect(after.milestones[0].status).toBe("refunded");
});
