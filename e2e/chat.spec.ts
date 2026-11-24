import { call, field, newEmail, otherPerson, signUp, expect, test } from "./helpers";

test("two people talk live: typing, delivery without reloading, read receipts, the contact warning", async ({
  page: client,
  browser,
}) => {
  await signUp(client, "Paula Reis", newEmail("paula"));
  await call(client, "PUT", "/me/client-profile", { company: "Ateliê Reis" });
  const project = await call(client, "POST", "/projects", {
    title: "Identidade visual para ateliê",
    description: "Logotipo, paleta e aplicação em etiquetas e embalagens.",
    category: "design",
    skills: ["identidade-visual"],
    budgetMinCents: 150_000,
    budgetMaxCents: 300_000,
    publish: true,
  });
  const freelancer = await otherPerson(browser);
  await signUp(freelancer, "Pedro Rocha", newEmail("pedro"));
  await call(freelancer, "PUT", "/me/freelancer-profile", {
    headline: "Identidade visual",
    bio: "Crio marcas do zero para pequenos negócios.",
    category: "design",
    skills: ["identidade-visual"],
    minBudgetCents: 90_000,
    available: true,
  });
  const proposal = await call(freelancer, "POST", `/projects/${project.id}/proposals`, {
    coverLetter: "Faço a marca completa com manual de uso e arquivos para gráfica.",
    deliveryDays: 15,
    milestones: [{ title: "Marca e manual", amountCents: 200_000 }],
  });

  // Both open the conversation the proposal started.
  await client.goto(`/projetos/${project.id}`);
  await client.getByRole("link", { name: "Conversar" }).click();
  await expect(client.getByText("Ao vivo")).toBeVisible();
  await freelancer.goto(`/mensagens/${proposal.conversationId}`);
  await expect(freelancer.getByText("Ao vivo")).toBeVisible();
  expect(client.url()).toContain(`/mensagens/${proposal.conversationId}`);

  const composer = (page: typeof client) => field(page, "Mensagem");
  await composer(client).pressSequentially("Oi, Pedro! Gostei do portfólio.");
  await expect(freelancer.getByText("Paula está digitando…")).toBeVisible();
  await composer(client).press("Enter");

  const messages = (page: typeof client) => page.getByRole("list", { name: "Mensagens" });
  await expect(messages(freelancer)).toContainText("Oi, Pedro! Gostei do portfólio.");
  await expect(freelancer.getByText("Paula está digitando…")).toBeHidden();
  // The freelancer has it on screen, so it counts as read.
  await expect(messages(client).getByText("Lida")).toBeVisible();

  // Before a contract, contact details get a warning while typing (and are still delivered).
  await composer(freelancer).fill("Me chama no zap (11) 91234-5678");
  await expect(freelancer.getByText("fora do Lance não há custódia")).toBeVisible();
  await composer(freelancer).press("Enter");
  await expect(messages(client)).toContainText("(11) 91234-5678");
  await expect(freelancer.getByText("fora do Lance não há custódia")).toBeVisible();

  // Unread count in the other tab's header, cleared by opening the conversation.
  await client.goto("/painel");
  await composer(freelancer).fill("Te mando a primeira versão amanhã.");
  await composer(freelancer).press("Enter");
  await expect(client.getByRole("link", { name: /Mensagens\s*1 não lidas/ })).toBeVisible();
  await client.getByRole("link", { name: /Mensagens/ }).click();
  await client.getByRole("link", { name: /Pedro Rocha/ }).click();
  await expect(messages(client)).toContainText("Te mando a primeira versão amanhã.");
  await expect(client.getByRole("link", { name: /não lidas/ })).toHaveCount(0);
});
