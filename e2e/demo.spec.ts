import { expect, test } from "./helpers";

test("one click into a demo: approve a delivery, get proposals from the showcase, switch persona", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Entrar como cliente/ }).click();
  await expect(page.getByRole("heading", { name: "Olá, Renata!" })).toBeVisible();
  await expect(page.getByText("você é Renata Alves (cliente)")).toBeVisible();

  // A contract is already under way: its first delivery waits for approval.
  await page
    .getByRole("link", { name: "Landing page para o curso de cerâmica" })
    .filter({ visible: true })
    .last()
    .click();
  const milestone = page.getByRole("article").filter({ hasText: "Layout no Figma" });
  await milestone.getByRole("button", { name: "Aprovar e pagar" }).click();
  const approve = page.getByRole("dialog");
  await expect(approve).toContainText("Lívia Prado recebe R$ 900");
  await approve.getByRole("button", { name: "Aprovar e pagar" }).click();
  await expect(milestone.getByText("Pago", { exact: true })).toBeVisible();

  // The open project gets a proposal from a seeded freelancer some seconds later.
  await page.goto("/painel");
  await page
    .getByRole("link", { name: "Fotos e descrições para a loja online" })
    .filter({ visible: true })
    .click();
  // Wait for the page itself: reloading before the client-side navigation lands would reload the panel.
  await expect(page).toHaveURL(/\/projetos\//);
  await expect(page.getByRole("heading", { name: "Fotos e descrições para a loja online" })).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(/Olá! Sou /).first()).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 40_000 });

  // The other side of the same demo: the freelancer was paid.
  await page.getByRole("button", { name: "Freelancer", exact: true }).click();
  await expect(page.getByText("você é Lívia Prado (freelancer)")).toBeVisible();
  await page.goto("/carteira");
  await expect(page.getByText(/^R\$\s900$/).first()).toBeVisible();

  // And the demo's inbox has what would have been emailed.
  await page.getByRole("link", { name: "E-mails da demo" }).click();
  await expect(page.getByText("Etapa “Layout no Figma” aprovada")).toBeVisible();
});
