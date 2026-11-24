import type { Page } from "@playwright/test";
import { field, newEmail, otherPerson, signUp, expect, test } from "./helpers";

/** The API through the web app, as the signed-in person in that page. */
async function call(page: Page, method: "POST" | "PUT", path: string, data: object = {}) {
  const response = await page.request.fetch(`/api${path}`, {
    method,
    data,
    headers: { origin: "http://localhost:3030" },
  });
  expect(response.status(), await response.text()).toBeLessThan(300);
  return response.json();
}

test("deposit, deliver, ask for a revision, deliver again, approve: the freelancer is paid minus the fee", async ({
  page: client,
  browser,
}) => {
  // Hiring, through the API (the screens for it have their own test).
  await signUp(client, "Paula Reis", newEmail("paula"));
  await call(client, "PUT", "/me/client-profile", { company: "Ateliê Reis" });
  const project = await call(client, "POST", "/projects", {
    title: "Loja virtual para ateliê de cerâmica",
    description: "Peças únicas, frete por CEP e pagamento por Pix e cartão.",
    category: "desenvolvimento",
    skills: ["shopify"],
    budgetMinCents: 300_000,
    budgetMaxCents: 600_000,
    publish: true,
  });
  const freelancer = await otherPerson(browser);
  await signUp(freelancer, "Carla Dias", newEmail("carla"));
  await call(freelancer, "PUT", "/me/freelancer-profile", {
    headline: "Lojas virtuais",
    bio: "Monto lojas Shopify para pequenos negócios.",
    category: "desenvolvimento",
    skills: ["shopify"],
    minBudgetCents: 100_000,
    available: true,
  });
  const proposal = await call(freelancer, "POST", `/projects/${project.id}/proposals`, {
    coverLetter: "Já fiz lojas para ateliês e conheço bem frete por CEP.",
    deliveryDays: 20,
    milestones: [
      { title: "Catálogo e tema", amountCents: 250_000 },
      { title: "Frete e pagamentos", amountCents: 200_000 },
    ],
  });
  const { contractId } = await call(client, "POST", `/proposals/${proposal.id}/accept`, { version: 1 });

  // The money, through the screens.
  await client.goto(`/contratos/${contractId}`);
  const first = client.getByRole("article").filter({ hasText: "Catálogo e tema" });
  await first.getByRole("button", { name: "Depositar R$ 2.500" }).click();
  await client.getByRole("dialog").getByRole("button", { name: "Depositar" }).click();
  await expect(first.getByText("Em andamento")).toBeVisible();
  await expect(client.getByText("Em custódia", { exact: true }).locator("..")).toContainText("R$ 2.500");

  await freelancer.goto(`/contratos/${contractId}`);
  const theirs = freelancer.getByRole("article").filter({ hasText: "Catálogo e tema" });
  await expect(theirs).toContainText("você recebe R$ 2.250");
  await theirs.getByRole("button", { name: "Entregar etapa" }).click();
  await field(freelancer, "O que você entregou").fill("Tema instalado e catálogo com 40 peças.");
  await freelancer.getByRole("button", { name: "Enviar entrega" }).click();
  await expect(theirs.getByText("o pagamento é liberado sozinho")).toBeVisible();

  await client.reload();
  await first.getByRole("button", { name: "Pedir revisão (2 restantes)" }).click();
  await field(client, "O que precisa mudar").fill("Faltou o frete por CEP no checkout.");
  await client.getByRole("button", { name: "Pedir revisão" }).last().click();
  await expect(first.getByText("Revisão pedida", { exact: true })).toBeVisible();

  await freelancer.reload();
  await theirs.getByRole("button", { name: "Entregar de novo" }).click();
  await expect(freelancer.getByRole("dialog")).toContainText("Faltou o frete por CEP no checkout.");
  await field(freelancer, "O que você entregou").fill("Frete por CEP configurado no checkout.");
  await freelancer.getByRole("button", { name: "Enviar entrega" }).click();

  await client.reload();
  await expect(first.getByRole("button", { name: "Pedir revisão (1 restante)" })).toBeVisible();
  await first.getByRole("button", { name: "Aprovar e pagar" }).click();
  const approve = client.getByRole("dialog");
  await expect(approve).toContainText("Carla Dias recebe R$ 2.250");
  await approve.getByRole("button", { name: "Aprovar e pagar" }).click();
  await expect(first.getByText("Pago", { exact: true })).toBeVisible();
  await expect(client.getByText("Pago", { exact: true }).first().locator("..")).toContainText("R$ 2.500");

  await freelancer.goto("/carteira");
  await expect(freelancer.getByText("R$ 2.250").first()).toBeVisible();
  await expect(freelancer.getByRole("link", { name: "Catálogo e tema" })).toBeVisible();
});
