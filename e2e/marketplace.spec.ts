import { field, newEmail, otherPerson, signUp, expect, test } from "./helpers";

// The e2e database keeps earlier runs' projects: a title of this run's own.
const TITLE = `Loja virtual para ateliê ${Date.now().toString(36)}`;

test("a client publishes, a freelancer proposes and changes the price, the client hires", async ({
  page: client,
  browser,
}) => {
  await signUp(client, "Paula Reis", newEmail("paula"));
  await client.getByRole("link", { name: "Criar perfil de cliente" }).click();
  await expect(client.getByRole("heading", { name: "Seu perfil" })).toBeVisible();
  await field(client, "Empresa").fill("Ateliê Reis");
  await client.getByRole("button", { name: "Criar perfil de cliente" }).click();
  await expect(client.getByRole("status").filter({ hasText: "Salvo." })).toBeVisible();

  await client.goto("/projetos/novo");
  await expect(client.getByRole("heading", { name: "Publicar um projeto" })).toBeVisible();
  await field(client, "Título").fill(TITLE);
  await field(client, "Descrição").fill(
    "Quero vender peças únicas pela internet: catálogo com fotos, frete por CEP e pagamento por Pix e cartão.",
  );
  await client.getByText("Shopify", { exact: true }).click();
  await field(client, "De (R$)").fill("3.000");
  await field(client, "Até (R$)").fill("2.000");
  await client.getByRole("button", { name: "Publicar projeto" }).click();
  await expect(client.getByText("O máximo não pode ser menor que o mínimo.")).toBeVisible();
  await field(client, "Até (R$)").fill("6.000");
  await client.getByRole("button", { name: "Publicar projeto" }).click();
  await expect(client.getByText("Este projeto é seu.")).toBeVisible();
  const projectUrl = client.url();

  // The freelancer finds it in the list and proposes in two milestones.
  const freelancer = await otherPerson(browser);
  await signUp(freelancer, "Carla Dias", newEmail("carla"));
  await freelancer.goto("/perfil/editar#freelancer");
  await field(freelancer, "Título").fill("Desenvolvedora de lojas virtuais");
  await field(freelancer, "Sobre você").fill("Monto lojas Shopify para pequenos negócios há seis anos.");
  await freelancer.getByText("Shopify", { exact: true }).click();
  await field(freelancer, "Projetos a partir de (R$)").fill("1.000");
  await freelancer.getByRole("button", { name: "Criar perfil de freelancer" }).click();
  await expect(freelancer.getByRole("status").filter({ hasText: "Salvo." })).toBeVisible();

  await freelancer.goto("/projetos");
  await freelancer.getByRole("link", { name: TITLE }).click();
  await expect(freelancer.getByRole("button", { name: "Enviar proposta" })).toBeVisible();
  await field(freelancer, "Carta de apresentação").fill(
    "Já fiz lojas para ateliês e conheço bem frete por CEP.",
  );
  await field(freelancer, "Prazo total (dias)").fill("25");
  await field(freelancer, "Etapa 1").fill("Catálogo e tema");
  await field(freelancer, "Valor (R$)").fill("2.500");
  await freelancer.getByRole("button", { name: "Adicionar etapa" }).click();
  await field(freelancer, "Etapa 2").fill("Frete e pagamentos");
  await field(freelancer, "Valor (R$)").nth(1).fill("1.800,50");
  await expect(freelancer.getByText("R$ 4.300,50")).toBeVisible();
  await freelancer.getByRole("button", { name: "Enviar proposta" }).click();
  await expect(freelancer.getByRole("button", { name: "Retirar proposta" })).toBeVisible();

  // The client opens the proposal; meanwhile the freelancer changes the price.
  await client.goto(projectUrl);
  await expect(client.getByText("R$ 4.300,50")).toBeVisible();
  await freelancer.getByRole("button", { name: "Alterar" }).click();
  await field(freelancer, "Valor (R$)").nth(1).fill("2.000");
  await freelancer.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(freelancer.getByRole("button", { name: "Retirar proposta" })).toBeVisible();

  await client.getByRole("button", { name: "Aceitar proposta" }).click();
  await client.getByRole("button", { name: "Aceitar e criar contrato" }).click();
  await expect(client.getByRole("alert").filter({ hasText: "A proposta mudou" })).toBeVisible();
  await expect(client.getByText("R$ 4.500", { exact: true })).toBeVisible();

  await client.getByRole("button", { name: "Aceitar proposta" }).click();
  const dialog = client.getByRole("dialog", { name: "Aceitar esta proposta?" });
  await expect(dialog).toContainText("R$ 4.500");
  await dialog.getByRole("button", { name: "Aceitar e criar contrato" }).click();
  await expect(client.getByText("Você aceitou uma proposta: o contrato foi criado.")).toBeVisible();

  await freelancer.reload();
  await expect(freelancer.getByText("O cliente aceitou")).toBeVisible();
  await freelancer.goto("/projetos");
  await expect(freelancer.getByRole("link", { name: TITLE })).toHaveCount(0);
});
