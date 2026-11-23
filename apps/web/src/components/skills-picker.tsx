"use client";

import { CATEGORIES, SKILLS } from "@lance/shared";

/** Skills from the catalog as toggle chips, the chosen category's group first. */
export function SkillsPicker({
  value,
  onChange,
  category,
  error,
  max = 12,
}: {
  value: string[];
  onChange: (skills: string[]) => void;
  category: string;
  error?: string;
  max?: number;
}) {
  const groups = [...CATEGORIES].sort((a, b) => Number(b.slug === category) - Number(a.slug === category));
  const toggle = (slug: string) =>
    onChange(value.includes(slug) ? value.filter((skill) => skill !== slug) : [...value, slug]);

  return (
    <fieldset className="grid gap-3" aria-describedby="skills-status">
      <legend className="mb-1.5 text-sm font-medium text-stone-800">Habilidades</legend>
      {groups.map((group) => (
        <div key={group.slug} className="grid gap-1.5">
          <p className="text-xs font-medium tracking-wide text-stone-500 uppercase">{group.label}</p>
          <div className="flex flex-wrap gap-1.5">
            {SKILLS.filter((skill) => skill.category === group.slug).map((skill) => {
              const checked = value.includes(skill.slug);
              return (
                <label
                  key={skill.slug}
                  className="cursor-pointer rounded-full border border-stone-300 bg-white px-3 py-1 text-sm text-stone-700 transition select-none has-checked:border-indigo-600 has-checked:bg-indigo-50 has-checked:text-indigo-800 has-focus-visible:outline-2 has-focus-visible:outline-indigo-600 has-disabled:opacity-50"
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={!checked && value.length >= max}
                    onChange={() => toggle(skill.slug)}
                  />
                  {skill.label}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <p id="skills-status" className={`text-sm ${error ? "text-red-700" : "text-stone-500"}`}>
        {error ?? `${value.length} de até ${max} escolhidas.`}
      </p>
    </fieldset>
  );
}
