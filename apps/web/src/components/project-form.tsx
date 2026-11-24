"use client";

import { CATEGORIES, projectInput, type ProjectDetail, type ProjectInput } from "@lance/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api, ApiFailure } from "@/lib/api";
import { serverFieldErrors, validate, without, type FieldErrors } from "@/lib/forms";
import { MoneyField, moneyText, readMoney } from "./money-field";
import { SkillsPicker } from "./skills-picker";
import { Button } from "./ui/button";
import { Select, TextArea, TextField } from "./ui/field";
import { Notice } from "./ui/notice";

/** Writing a project: new (draft or published at once) or editing one that is still a draft or open. */
export function ProjectForm({ project }: { project?: ProjectDetail }) {
  const router = useRouter();
  const [values, setValues] = useState({
    title: project?.title ?? "",
    description: project?.description ?? "",
    category: project?.category ?? "desenvolvimento",
    skills: project?.skills ?? [],
    budgetMin: moneyText(project?.budgetMinCents),
    budgetMax: moneyText(project?.budgetMaxCents),
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState<"draft" | "publish" | "save" | null>(null);

  function set<K extends keyof typeof values>(field: K, value: (typeof values)[K]) {
    const key = field === "budgetMin" ? "budgetMinCents" : field === "budgetMax" ? "budgetMaxCents" : field;
    setErrors((current) => without(current, key));
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent, mode: "draft" | "publish" | "save") {
    event.preventDefault();
    const min = readMoney(values.budgetMin);
    const max = readMoney(values.budgetMax);
    const input: ProjectInput = {
      title: values.title,
      description: values.description,
      category: values.category as ProjectInput["category"],
      skills: values.skills as ProjectInput["skills"],
      budgetMinCents: min ?? 0,
      budgetMaxCents: max ?? 0,
    };
    const { data, errors } = validate(projectInput, input);
    const money: FieldErrors = {};
    if (min === null) money.budgetMinCents = "Digite um valor, como 1.500.";
    else if (min < 5_000) money.budgetMinCents = "O mínimo é R$ 50.";
    if (max === null) money.budgetMaxCents = "Digite um valor, como 3.000.";
    else if (min !== null && max < min) money.budgetMaxCents = "O máximo não pode ser menor que o mínimo.";
    setErrors({ ...errors, ...money });
    setFailure(null);
    if (!data || Object.keys(money).length > 0) return;
    setBusy(mode);
    try {
      const saved = project
        ? await api<ProjectDetail>(`/projects/${project.id}`, { method: "PUT", body: data })
        : await api<ProjectDetail>("/projects", { body: { ...data, publish: mode === "publish" } });
      router.push(`/projetos/${saved.id}`);
      router.refresh();
    } catch (error) {
      setErrors(serverFieldErrors(error));
      setFailure(error instanceof ApiFailure ? error.message : "Não foi possível salvar.");
      setBusy(null);
    }
  }

  return (
    <form
      onSubmit={(event) => submit(event, project ? "save" : "publish")}
      noValidate
      className="grid gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      {failure ? <Notice tone="error">{failure}</Notice> : null}
      <TextField
        label="Título"
        value={values.title}
        onChange={(e) => set("title", e.target.value)}
        error={errors.title}
        hint="O que precisa ser feito, em uma frase. Ex.: Loja virtual com assinatura mensal."
      />
      <TextArea
        label="Descrição"
        rows={8}
        value={values.description}
        onChange={(e) => set("description", e.target.value)}
        error={errors.description}
        hint="Contexto, o que você já tem pronto, o que espera receber e até quando."
      />
      <Select
        label="Categoria"
        value={values.category}
        onChange={(e) => set("category", e.target.value)}
        error={errors.category}
      >
        {CATEGORIES.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.label}
          </option>
        ))}
      </Select>
      <SkillsPicker
        value={values.skills}
        onChange={(skills) => set("skills", skills)}
        category={values.category}
        error={errors.skills}
        max={8}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium text-stone-800">Orçamento (preço fechado)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <MoneyField
            label="De (R$)"
            value={values.budgetMin}
            onChange={(e) => set("budgetMin", e.target.value)}
            error={errors.budgetMinCents}
          />
          <MoneyField
            label="Até (R$)"
            value={values.budgetMax}
            onChange={(e) => set("budgetMax", e.target.value)}
            error={errors.budgetMaxCents}
          />
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        {project ? (
          <Button type="submit" busy={busy === "save"}>
            Salvar alterações
          </Button>
        ) : (
          <>
            <Button type="submit" busy={busy === "publish"} disabled={busy !== null}>
              Publicar projeto
            </Button>
            <Button
              type="button"
              variant="secondary"
              busy={busy === "draft"}
              disabled={busy !== null}
              onClick={(event) => submit(event, "draft")}
            >
              Salvar rascunho
            </Button>
          </>
        )}
      </div>
    </form>
  );
}
