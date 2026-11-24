import type { PrismaService } from "../prisma/prisma.service.ts";

export interface Problem {
  check: string;
  id: string;
  detail: string;
}

/**
 * Checks the whole ledger against itself and against the milestones. An empty list means: every
 * transaction balances, cached balances equal their entries, nothing is negative that shouldn't be,
 * each milestone's escrow holds exactly its amount while money is held, its movements match its state,
 * and every release split fee and payout as its contract says. Run in CI and on the admin's health page.
 */
export async function reconcile(db: PrismaService): Promise<Problem[]> {
  const rows = await db.$queryRaw<Problem[]>`
    SELECT 'unbalanced_transaction' AS check, t.id::text AS id,
           'sum ' || COALESCE(SUM(e."amountCents"), 0) || ', ' || COUNT(e.id) || ' entries' AS detail
      FROM ledger_transactions t LEFT JOIN ledger_entries e ON e."transactionId" = t.id
      GROUP BY t.id HAVING COALESCE(SUM(e."amountCents"), 0) <> 0 OR COUNT(e.id) < 2
    UNION ALL
    SELECT 'cached_balance', a.id::text,
           'cached ' || a."balanceCents" || ', entries ' || COALESCE(SUM(e."amountCents"), 0)
      FROM ledger_accounts a LEFT JOIN ledger_entries e ON e."accountId" = a.id
      GROUP BY a.id HAVING a."balanceCents" <> COALESCE(SUM(e."amountCents"), 0)
    UNION ALL
    SELECT 'negative_balance', a.id::text, a.kind || ' ' || a."balanceCents"
      FROM ledger_accounts a WHERE a.kind <> 'external' AND a."balanceCents" < 0
    UNION ALL
    SELECT 'escrow_mismatch', m.id::text,
           m.status || ' holds ' || COALESCE(a."balanceCents", 0) || ' of ' || m."amountCents"
      FROM contract_milestones m
      LEFT JOIN ledger_accounts a ON a.kind = 'escrow' AND a."milestoneId" = m.id
      WHERE COALESCE(a."balanceCents", 0) <> CASE
        WHEN m.status IN ('funded', 'submitted', 'revision_requested', 'disputed') THEN m."amountCents" ELSE 0 END
    UNION ALL
    SELECT 'movements_mismatch', m.id::text, m.status::text || ' with ' ||
           COALESCE((SELECT string_agg(t.kind::text, ',' ORDER BY t.kind) FROM ledger_transactions t
                      WHERE t."milestoneId" = m.id), 'no movements')
      FROM contract_milestones m
      WHERE (m.status NOT IN ('pending_funding', 'cancelled'))
              <> EXISTS (SELECT 1 FROM ledger_transactions t WHERE t."milestoneId" = m.id AND t.kind = 'fund')
         OR (m.status = 'released')
              <> EXISTS (SELECT 1 FROM ledger_transactions t WHERE t."milestoneId" = m.id AND t.kind = 'release')
         OR (m.status = 'refunded')
              <> EXISTS (SELECT 1 FROM ledger_transactions t WHERE t."milestoneId" = m.id AND t.kind = 'refund')
    UNION ALL
    SELECT 'fee_split', t.id::text,
           'revenue ' || COALESCE(SUM(e."amountCents") FILTER (WHERE a.kind = 'revenue'), 0) ||
           ', expected ' || (m."amountCents" * c."feeBps" / 10000)
      FROM ledger_transactions t
      JOIN contract_milestones m ON m.id = t."milestoneId"
      JOIN contracts c ON c.id = m."contractId"
      JOIN ledger_entries e ON e."transactionId" = t.id
      JOIN ledger_accounts a ON a.id = e."accountId"
      WHERE t.kind = 'release'
      GROUP BY t.id, m."amountCents", c."feeBps"
      HAVING COALESCE(SUM(e."amountCents") FILTER (WHERE a.kind = 'revenue'), 0)
               <> m."amountCents" * c."feeBps" / 10000
          OR COALESCE(SUM(e."amountCents") FILTER (WHERE a.kind = 'escrow'), 0) <> -m."amountCents"`;
  return rows;
}
