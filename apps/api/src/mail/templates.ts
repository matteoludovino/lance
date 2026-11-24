/** An email ready to send: plain text for every client, HTML for the ones that show it. */
export interface Email {
  subject: string;
  text: string;
  html: string;
}

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

/** One simple layout: a greeting, paragraphs, at most one button, a footer. */
function layout({
  subject,
  greeting,
  paragraphs,
  action,
  footer,
}: {
  subject: string;
  greeting: string;
  paragraphs: string[];
  action?: { label: string; url: string };
  footer: string;
}): Email {
  const text = [
    greeting,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(action ? [`${action.label}: ${action.url}`, ""] : []),
    "—",
    footer,
  ].join("\n");
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f6f7f9;font-family:Arial,Helvetica,sans-serif;color:#1c2024">
<div style="max-width:520px;margin:0 auto;padding:32px 24px">
<p style="font-size:20px;font-weight:bold;margin:0 0 24px">Lance</p>
<p style="margin:0 0 16px">${escape(greeting)}</p>
${paragraphs.map((paragraph) => `<p style="margin:0 0 16px;line-height:1.5">${escape(paragraph)}</p>`).join("\n")}
${
  action
    ? `<p style="margin:24px 0"><a href="${escape(action.url)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${escape(action.label)}</a></p>
<p style="font-size:13px;color:#60646c;margin:0 0 16px">Se o botão não abrir, copie este endereço: ${escape(action.url)}</p>`
    : ""
}
<p style="font-size:13px;color:#60646c;margin:32px 0 0;border-top:1px solid #e0e1e6;padding-top:16px">${escape(footer)}</p>
</div></body></html>`;
  return { subject, text, html };
}

const IGNORE = "Se não foi você, ignore este e-mail: nada muda na sua conta.";

export function verifyEmail(name: string, url: string): Email {
  return layout({
    subject: "Confirme seu e-mail no Lance",
    greeting: `Olá, ${name}!`,
    paragraphs: [
      "Falta pouco: confirme que este e-mail é seu para entrar no Lance.",
      "O link vale por 48 horas e pode ser usado uma vez.",
    ],
    action: { label: "Confirmar e-mail", url },
    footer: IGNORE,
  });
}

export function resetPassword(name: string, url: string): Email {
  return layout({
    subject: "Redefina sua senha do Lance",
    greeting: `Olá, ${name}!`,
    paragraphs: [
      "Recebemos um pedido para redefinir a senha da sua conta.",
      "O link vale por 1 hora. Ao trocar a senha, você sai de todos os outros dispositivos.",
    ],
    action: { label: "Criar nova senha", url },
    footer: IGNORE,
  });
}

/** Signing up with an address that already has an account: tell its owner instead of saying so on screen. */
export function signupWithExistingEmail(name: string, loginUrl: string): Email {
  return layout({
    subject: "Alguém tentou criar uma conta com seu e-mail",
    greeting: `Olá, ${name}!`,
    paragraphs: [
      "Alguém tentou criar uma conta no Lance com este e-mail, mas você já tem uma.",
      "Se foi você, é só entrar. Esqueceu a senha? Use “Esqueci minha senha” na página de entrada.",
    ],
    action: { label: "Entrar no Lance", url: loginUrl },
    footer: IGNORE,
  });
}

const NOTICE = "Você recebe este e-mail porque tem uma conta no Lance.";

export function proposalReceived(
  name: string,
  project: string,
  freelancer: string,
  price: string,
  url: string,
): Email {
  return layout({
    subject: `Nova proposta para “${project}”`,
    greeting: `Olá, ${name}!`,
    paragraphs: [`${freelancer} enviou uma proposta de ${price} para o seu projeto “${project}”.`],
    action: { label: "Ver propostas", url },
    footer: NOTICE,
  });
}

export function proposalAccepted(name: string, project: string, client: string, url: string): Email {
  return layout({
    subject: `Sua proposta para “${project}” foi aceita`,
    greeting: `Olá, ${name}!`,
    paragraphs: [
      `${client} aceitou sua proposta para “${project}”. O contrato foi criado com as etapas que você propôs.`,
      "O trabalho começa quando o cliente depositar a primeira etapa.",
    ],
    action: { label: "Ver projeto", url },
    footer: NOTICE,
  });
}

export function proposalDeclined(name: string, project: string, url: string): Email {
  return layout({
    subject: `Sua proposta para “${project}” não foi escolhida`,
    greeting: `Olá, ${name}!`,
    paragraphs: [
      `O cliente seguiu outro caminho em “${project}”: sua proposta não foi escolhida desta vez.`,
      "Há outros projetos recebendo propostas agora.",
    ],
    action: { label: "Ver projetos", url },
    footer: NOTICE,
  });
}

/** Everything that happens to a milestone, in one short email: what happened and a link to the contract. */
export function milestoneUpdate(name: string, subject: string, sentence: string, url: string): Email {
  return layout({
    subject,
    greeting: `Olá, ${name}!`,
    paragraphs: [sentence],
    action: { label: "Ver contrato", url },
    footer: NOTICE,
  });
}

export function reviewUpdate(
  name: string,
  subject: string,
  sentence: string,
  url: string,
  label: string,
): Email {
  return layout({
    subject,
    greeting: `Olá, ${name}!`,
    paragraphs: [sentence],
    action: { label, url },
    footer: NOTICE,
  });
}
