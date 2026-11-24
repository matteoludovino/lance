import { describe, expect, it } from "vitest";
import { detectContact } from "../src";

describe("detectContact", () => {
  it.each([
    ["me chama no (11) 91234-5678", ["phone", "outside_channel"]],
    ["meu cel é 11 91234-5678", ["phone"]],
    ["+55 21 9 8765-4321", ["phone"]],
    ["liga 1132104567", ["phone"]],
    ["98765-4321", ["phone"]],
    ["manda pra ana.souza@gmail.com", ["email"]],
    ["fala comigo no whats", ["outside_channel"]],
    ["passa teu zap", ["outside_channel"]],
    ["wa.me/5511912345678", ["phone", "outside_channel"]],
    ["me segue @ana.design", ["outside_channel"]],
    ["vamos pelo telegram", ["outside_channel"]],
  ])("flags %j", (text, kinds) => {
    expect(detectContact(text).sort()).toEqual([...kinds].sort());
  });

  it.each([
    "O orçamento fica em R$ 1.500,00 em duas etapas.",
    "Consigo por R$ 12.345,67 ou R$ 1234567",
    "Entrego dia 24/11/2026 às 14:30.",
    "O CEP da loja é 01310-100.",
    "São 3 etapas de 15 dias, total 45 dias.",
    "Prazo: 20261124. Pedido nº 123456.",
    "Uso Figma e React há 8 anos.",
    "Meu portfólio está no perfil.",
  ])("leaves %j alone", (text) => {
    expect(detectContact(text)).toEqual([]);
  });
});
