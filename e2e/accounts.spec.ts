import { expect, test } from "@playwright/test";
import { seedId } from "../apps/api/src/seed/seed.ts";
import { PASSWORD, emailedLink, field, newEmail, signUp } from "./helpers";

test("sign up, confirm by email, build a freelancer profile and see it as a visitor", async ({
  page,
  browser,
}) => {
  const email = newEmail("carla");
  await signUp(page, "Carla Dias", email);
  // The token was in the fragment and is gone from the address bar.
  expect(page.url()).not.toContain("#t=");

  await page.getByRole("group", { name: "Modo" }).getByRole("button", { name: "Trabalhar" }).click();
  await page.getByRole("link", { name: "Criar perfil de freelancer" }).click();
  await field(page, "Título").fill("Designer de interfaces para apps");
  await page
    .getByLabel("Sobre você")
    .fill("Desenho interfaces para apps e sites há oito anos, do fluxo ao protótipo.");
  await field(page, "Categoria principal").selectOption({ label: "Design" });
  await field(page, "Projetos a partir de (R$)").fill("1.800,50");
  await page.getByRole("button", { name: "Criar perfil de freelancer" }).click();
  await expect(page.getByText("Escolha pelo menos uma.")).toBeVisible();
  await page.getByText("UI design", { exact: true }).click();
  await page.getByText("Figma", { exact: true }).click();
  await expect(page.getByText("Escolha pelo menos uma.")).toBeHidden();
  await field(page, "Cidade (opcional)").fill("Natal");
  await field(page, "UF").selectOption("RN");
  await page.getByRole("button", { name: "Criar perfil de freelancer" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Salvo." })).toBeVisible();

  const publicUrl = await page.getByRole("link", { name: "Ver página pública" }).getAttribute("href");
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(publicUrl!);
  await expect(visitor.getByRole("heading", { name: "Carla Dias" })).toBeVisible();
  await expect(visitor.getByText("Projetos a partir de R$ 1.800,50")).toBeVisible();
  await expect(visitor.getByText("Design · Natal/RN")).toBeVisible();
  await expect(visitor.getByRole("listitem")).toHaveText(["UI design", "Figma"]);
  await expect(visitor.locator("body")).not.toContainText(email);
});

test("a new password, from the emailed link, signs out every other browser", async ({ page, browser }) => {
  const email = newEmail("bruno");
  await signUp(page, "Bruno Lima", email);

  const other = await (await browser.newContext()).newPage();
  await other.goto("/entrar");
  await field(other, "E-mail").fill(email);
  await field(other, "Senha").fill("senha-errada");
  await other.getByRole("button", { name: "Entrar" }).click();
  await expect(other.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
  await other.getByRole("link", { name: "Esqueci minha senha" }).click();
  await field(other, "E-mail").fill(email);
  await other.getByRole("button", { name: "Enviar link" }).click();
  await expect(other.getByText("o link já está a caminho")).toBeVisible();

  await other.goto(await emailedLink(email, "Redefina sua senha"));
  await field(other, "Nova senha").fill("nova-senha-789");
  await field(other, "Repita a senha").fill("nova-senha-789");
  await other.getByRole("button", { name: "Salvar e entrar" }).click();
  await expect(other.getByRole("heading", { name: "Olá, Bruno!" })).toBeVisible();

  // The first browser's session ended with the reset.
  await page.reload();
  await expect(page).toHaveURL(/\/entrar\?next=%2Fpainel/);
  await field(page, "E-mail").fill(email);
  await field(page, "Senha").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "E-mail ou senha incorretos." })).toBeVisible();
  await field(page, "Senha").fill("nova-senha-789");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/painel");
});

test("seeded people have public pages; unknown ones don't", async ({ page }) => {
  await page.goto(`/freelancers/${seedId("marina-costa")}`);
  await expect(page.getByRole("heading", { name: "Marina Costa" })).toBeVisible();
  await expect(page.getByText("Disponível para novos projetos")).toBeVisible();
  await page.goto(`/clientes/${seedId("cafe-serra")}`);
  await expect(page.getByText("Café da Serra")).toBeVisible();

  await page.goto("/freelancers/0a2e1a43-0000-8000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Não encontrado" })).toBeVisible();
  const response = await page.request.get("/api/session");
  expect(await response.json()).toEqual({ me: null });
});
