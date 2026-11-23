"use client";

import { signupInput } from "@lance/shared";
import { useState, type FormEvent } from "react";
import { AuthCard, TextLink } from "@/components/auth-card";
import { ResendVerification } from "@/components/resend-verification";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { serverFieldErrors, validate, type FieldErrors } from "@/lib/forms";
import { useRedirectSignedIn } from "@/lib/session";

export function SignupForm() {
  useRedirectSignedIn();
  const [values, setValues] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const change = (field: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { data, errors } = validate(signupInput, values);
    setErrors(errors ?? {});
    setFailure(null);
    if (!data) return;
    setBusy(true);
    try {
      await api("/auth/signup", { body: data });
      setSentTo(data.email);
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setFailure(error instanceof ApiFailure ? error.message : "Algo deu errado. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthCard title="Confira seu e-mail">
        <p className="text-stone-700">
          Enviamos um link de confirmação para{" "}
          <strong className="font-medium text-stone-900">{sentTo}</strong>. Abra-o para entrar no Lance. Ele
          vale por 48 horas.
        </p>
        <ResendVerification email={sentTo} />
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Crie sua conta"
      intro="Uma conta serve para contratar e para trabalhar: você escolhe o lado a qualquer momento."
      footer={
        <>
          Já tem conta? <TextLink href="/entrar">Entrar</TextLink>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        {failure ? <Notice tone="error">{failure}</Notice> : null}
        <TextField
          label="Nome"
          autoComplete="name"
          value={values.name}
          onChange={change("name")}
          error={errors.name}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={change("email")}
          error={errors.email}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={change("password")}
          error={errors.password}
          hint="Pelo menos 8 caracteres. Uma frase longa é mais segura que símbolos."
        />
        <Button type="submit" busy={busy}>
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}
