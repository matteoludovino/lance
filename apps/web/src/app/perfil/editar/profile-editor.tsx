"use client";

import Link from "next/link";
import {
  CATEGORIES,
  STATES,
  clientProfileInput,
  formatBRL,
  freelancerProfileInput,
  parseBRL,
  updateAccountInput,
  type Me,
} from "@lance/shared";
import { useState, type FormEvent, type ReactNode } from "react";
import type { z } from "zod";
import { RequireSession } from "@/components/require-session";
import { SkillsPicker } from "@/components/skills-picker";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select, TextArea, TextField } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { serverFieldErrors, validate, type FieldErrors } from "@/lib/forms";
import { setMode, useMode, type Mode } from "@/lib/mode";
import { useSetMe } from "@/lib/session";

export function ProfileEditor() {
  return <RequireSession>{(me) => <Editor me={me} />}</RequireSession>;
}

const TABS: { mode: Mode; hash: string; label: string }[] = [
  { mode: "freelancer", hash: "freelancer", label: "Perfil de freelancer" },
  { mode: "client", hash: "cliente", label: "Perfil de cliente" },
];

function Editor({ me }: { me: Me }) {
  const mode = useMode();
  // A link to #cliente or #freelancer opens that side. (Rendered in the browser only, after the session
  // loads, so reading the address here is safe.)
  const [tab, setTab] = useState<Mode>(
    () => TABS.find((option) => `#${option.hash}` === location.hash)?.mode ?? mode,
  );

  function choose(next: Mode) {
    setTab(next);
    setMode(next);
    history.replaceState(null, "", `#${TABS.find((option) => option.mode === next)!.hash}`);
  }

  return (
    <main className="mx-auto grid max-w-3xl gap-8 px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Seu perfil</h1>
        <Link href="/perfil/emails" className="text-sm font-medium text-indigo-700 hover:underline">
          Preferências de e-mail
        </Link>
      </div>
      <AccountForm me={me} />
      <section className="grid gap-4">
        <div role="tablist" aria-label="Lado do perfil" className="flex gap-1 border-b border-stone-200">
          {TABS.map((option) => (
            <button
              key={option.mode}
              id={`tab-${option.mode}`}
              role="tab"
              type="button"
              aria-selected={tab === option.mode}
              aria-controls={`panel-${option.mode}`}
              onClick={() => choose(option.mode)}
              className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-stone-600 aria-selected:border-indigo-600 aria-selected:font-medium aria-selected:text-stone-900"
            >
              {option.label}
            </button>
          ))}
        </div>
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {tab === "freelancer" ? <FreelancerForm me={me} /> : <ClientForm me={me} />}
        </div>
      </section>
    </main>
  );
}

/** Saves one form: validates with the shared schema, sends, updates the account everywhere. */
function useSave<T extends z.ZodType>(schema: T, path: string, method: "PUT" | "PATCH") {
  const setMe = useSetMe();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(values: unknown, extraErrors: FieldErrors = {}) {
    const { data, errors } = validate(schema, values);
    setErrors({ ...errors, ...extraErrors });
    setResult(null);
    if (!data || Object.keys(extraErrors).length > 0) return;
    setBusy(true);
    try {
      setMe(await api<Me>(path, { method, body: data }));
      setResult({ tone: "success", text: "Salvo." });
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setResult({
        tone: "error",
        text: error instanceof ApiFailure ? error.message : "Não foi possível salvar.",
      });
    } finally {
      setBusy(false);
    }
  }
  /** A field changed: its old error no longer applies. */
  const clear = (field: string) =>
    setErrors((current) => {
      if (!(field in current)) return current;
      const rest = { ...current };
      delete rest[field];
      return rest;
    });
  return { save, errors, result, busy, clear };
}

function FormCard({
  onSubmit,
  children,
  footer,
}: {
  onSubmit: (event: FormEvent) => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      {children}
      <div className="flex flex-wrap items-center gap-3">{footer}</div>
    </form>
  );
}

function AccountForm({ me }: { me: Me }) {
  const [name, setName] = useState(me.name);
  const { save, errors, result, busy } = useSave(updateAccountInput, "/me", "PATCH");
  return (
    <FormCard
      onSubmit={(event) => {
        event.preventDefault();
        void save({ name });
      }}
      footer={
        <>
          <Button type="submit" busy={busy}>
            Salvar nome
          </Button>
          {result ? <InlineResult {...result} /> : null}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="Nome"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
        />
        <TextField label="E-mail" value={me.email} disabled hint="Só você vê o seu e-mail." />
      </div>
    </FormCard>
  );
}

function InlineResult({ tone, text }: { tone: "success" | "error"; text: string }) {
  return tone === "error" ? (
    <Notice tone="error">{text}</Notice>
  ) : (
    <p role="status" className="text-sm font-medium text-emerald-800">
      {text}
    </p>
  );
}

function LocationFields({
  city,
  state,
  onCity,
  onState,
  errors,
}: {
  city: string;
  state: string;
  onCity: (value: string) => void;
  onState: (value: string) => void;
  errors: FieldErrors;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
      <TextField
        label="Cidade (opcional)"
        autoComplete="address-level2"
        value={city}
        onChange={(e) => onCity(e.target.value)}
        error={errors.city}
      />
      <Select label="UF" value={state} onChange={(e) => onState(e.target.value)} error={errors.state}>
        <option value="">—</option>
        {STATES.map((uf) => (
          <option key={uf}>{uf}</option>
        ))}
      </Select>
    </div>
  );
}

function ClientForm({ me }: { me: Me }) {
  const [values, setValues] = useState({
    company: me.client?.company ?? "",
    about: me.client?.about ?? "",
    city: me.client?.city ?? "",
    state: me.client?.state ?? "",
  });
  const { save, errors, result, busy, clear } = useSave(clientProfileInput, "/me/client-profile", "PUT");
  const set = (field: keyof typeof values) => (value: string) => {
    clear(field);
    setValues((current) => ({ ...current, [field]: value }));
  };

  return (
    <FormCard
      onSubmit={(event) => {
        event.preventDefault();
        void save({ ...values, state: values.state || null });
      }}
      footer={
        <>
          <Button type="submit" busy={busy}>
            {me.client ? "Salvar perfil de cliente" : "Criar perfil de cliente"}
          </Button>
          {me.client ? (
            <ButtonLink href={`/clientes/${me.id}`} variant="ghost">
              Ver página pública
            </ButtonLink>
          ) : null}
          {result ? <InlineResult {...result} /> : null}
        </>
      }
    >
      <p className="text-sm text-stone-600">
        O que os freelancers veem de quem está contratando. Tudo é opcional.
      </p>
      <TextField
        label="Empresa"
        autoComplete="organization"
        value={values.company}
        onChange={(e) => set("company")(e.target.value)}
        error={errors.company}
        hint="Deixe em branco se você contrata como pessoa física."
      />
      <TextArea
        label="Sobre"
        value={values.about}
        onChange={(e) => set("about")(e.target.value)}
        error={errors.about}
      />
      <LocationFields
        city={values.city}
        state={values.state}
        onCity={set("city")}
        onState={set("state")}
        errors={errors}
      />
    </FormCard>
  );
}

function FreelancerForm({ me }: { me: Me }) {
  const profile = me.freelancer;
  const [values, setValues] = useState({
    headline: profile?.headline ?? "",
    bio: profile?.bio ?? "",
    category: profile?.category ?? CATEGORIES[0].slug,
    skills: profile?.skills ?? [],
    minBudget: profile ? formatBRL(profile.minBudgetCents).replace(/^R\$\s*/, "") : "",
    available: profile?.available ?? true,
    city: profile?.city ?? "",
    state: profile?.state ?? "",
  });
  const { save, errors, result, busy, clear } = useSave(
    freelancerProfileInput,
    "/me/freelancer-profile",
    "PUT",
  );
  const set =
    <K extends keyof typeof values>(field: K) =>
    (value: (typeof values)[K]) => {
      // The typed budget is checked as minBudgetCents.
      clear(field === "minBudget" ? "minBudgetCents" : field);
      setValues((current) => ({ ...current, [field]: value }));
    };

  function submit(event: FormEvent) {
    event.preventDefault();
    const minBudgetCents = parseBRL(values.minBudget);
    const budgetError =
      minBudgetCents === null
        ? "Digite um valor, como 1.500 ou 1.500,00."
        : minBudgetCents < 5_000
          ? "O mínimo é R$ 50,00."
          : minBudgetCents > 10_000_000
            ? "O máximo é R$ 100.000,00."
            : null;
    void save(
      {
        headline: values.headline,
        bio: values.bio,
        category: values.category,
        skills: values.skills,
        minBudgetCents: minBudgetCents ?? 0,
        available: values.available,
        city: values.city,
        state: values.state || null,
      },
      budgetError ? { minBudgetCents: budgetError } : {},
    );
  }

  return (
    <FormCard
      onSubmit={submit}
      footer={
        <>
          <Button type="submit" busy={busy}>
            {profile ? "Salvar perfil de freelancer" : "Criar perfil de freelancer"}
          </Button>
          {profile ? (
            <ButtonLink href={`/freelancers/${me.id}`} variant="ghost">
              Ver página pública
            </ButtonLink>
          ) : null}
          {result ? <InlineResult {...result} /> : null}
        </>
      }
    >
      <TextField
        label="Título"
        value={values.headline}
        onChange={(e) => set("headline")(e.target.value)}
        error={errors.headline}
        hint="Em poucas palavras, o que você faz. Ex.: Designer de interfaces para apps."
      />
      <TextArea
        label="Sobre você"
        value={values.bio}
        onChange={(e) => set("bio")(e.target.value)}
        error={errors.bio}
        hint="Experiência, como você trabalha, o que entrega."
        rows={6}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Categoria principal"
          value={values.category}
          onChange={(e) => set("category")(e.target.value as typeof values.category)}
          error={errors.category}
        >
          {CATEGORIES.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.label}
            </option>
          ))}
        </Select>
        <TextField
          label="Projetos a partir de (R$)"
          inputMode="decimal"
          value={values.minBudget}
          onChange={(e) => set("minBudget")(e.target.value)}
          error={errors.minBudgetCents}
          hint="O menor orçamento que você aceita."
        />
      </div>
      <SkillsPicker
        value={values.skills}
        onChange={set("skills")}
        category={values.category}
        error={errors.skills}
      />
      <label className="flex items-center gap-3 text-sm text-stone-800">
        <input
          type="checkbox"
          className="size-4 accent-indigo-600"
          checked={values.available}
          onChange={(e) => set("available")(e.target.checked)}
        />
        Disponível para novos projetos
      </label>
      <LocationFields
        city={values.city}
        state={values.state}
        onCity={set("city")}
        onState={set("state")}
        errors={errors}
      />
    </FormCard>
  );
}
