"use client";

import { reviewInput, type ContractReviews, type ContractView } from "@lance/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ReviewItem } from "@/components/review-list";
import { StarInput } from "@/components/stars";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { api, ApiFailure } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { validate, without, type FieldErrors } from "@/lib/forms";

/** After the contract: each side reviews the other; both appear when both are in, or when time is up. */
export function ReviewSection({ contract }: { contract: ContractView }) {
  const queries = useQueryClient();
  const key = ["contract-reviews", contract.id];
  const { data } = useQuery({
    queryKey: key,
    queryFn: () => api<ContractReviews>(`/contracts/${contract.id}/reviews`),
  });
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data || contract.role === "admin") return null;
  const other = contract.role === "client" ? contract.freelancer : contract.client;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validate(reviewInput, { rating, comment });
    const ratingError: FieldErrors = rating === 0 ? { rating: "Escolha de 1 a 5 estrelas." } : {};
    setErrors({ ...checked.errors, ...ratingError });
    setFailure(null);
    if (!checked.data || rating === 0) return;
    setBusy(true);
    try {
      await api(`/contracts/${contract.id}/reviews`, { body: checked.data });
      await queries.invalidateQueries({ queryKey: key });
    } catch (error) {
      setFailure(error instanceof ApiFailure ? error.message : "Não foi possível enviar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="reviews-heading" className="grid gap-4">
      <h2 id="reviews-heading" className="text-sm font-semibold tracking-wide text-stone-500 uppercase">
        Avaliações
      </h2>
      {data.canReview ? (
        <form
          onSubmit={submit}
          noValidate
          className="grid gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
        >
          <p className="text-stone-700">
            Como foi trabalhar com <strong>{other.name}</strong>? Sua avaliação só aparece quando os dois
            avaliarem
            {data.closesAt ? `, ou em ${dateTime(data.closesAt)}` : ""}; depois de enviada, não dá para mudar.
          </p>
          {data.theirsWaiting ? (
            <Notice tone="info">
              {other.name.split(" ")[0]} já avaliou você: as duas aparecem assim que você enviar a sua.
            </Notice>
          ) : null}
          {failure ? <Notice tone="error">{failure}</Notice> : null}
          <StarInput
            value={rating}
            onChange={(n) => {
              setRating(n);
              setErrors((current) => without(current, "rating"));
            }}
            error={errors.rating}
          />
          <TextArea
            label="Comentário"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            error={errors.comment}
            hint="O que foi bom, o que poderia melhorar. Seja justo: fica no perfil público."
          />
          <Button type="submit" busy={busy} className="justify-self-start">
            Enviar avaliação
          </Button>
        </form>
      ) : null}
      {data.mine ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-stone-600">Sua avaliação de {other.name}</p>
          <ReviewItem review={data.mine} />
        </div>
      ) : null}
      {data.theirs ? (
        <div className="grid gap-2">
          <p className="text-sm font-medium text-stone-600">O que {other.name} disse sobre você</p>
          <ReviewItem review={data.theirs} />
        </div>
      ) : data.mine ? (
        <p className="text-sm text-stone-600">
          {data.theirsWaiting
            ? "A avaliação do outro lado aparece em instantes."
            : `A avaliação de ${other.name.split(" ")[0]} aparece quando ela for enviada ou quando o prazo terminar${data.closesAt ? ` (${dateTime(data.closesAt)})` : ""}.`}
        </p>
      ) : !data.canReview && !data.mine ? (
        <p className="text-sm text-stone-600">O prazo para avaliar este contrato terminou.</p>
      ) : null}
    </section>
  );
}
