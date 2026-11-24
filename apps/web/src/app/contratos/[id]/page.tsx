import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileSkeleton } from "@/components/profile-page";
import { ContractScreen } from "./contract-screen";

export const metadata: Metadata = { title: "Contrato" };

export default function ContractPage({ params }: PageProps<"/contratos/[id]">) {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Suspense fallback={<ProfileSkeleton />}>
        <Contract params={params} />
      </Suspense>
    </main>
  );
}

async function Contract({ params }: { params: PageProps<"/contratos/[id]">["params"] }) {
  const { id } = await params;
  return <ContractScreen id={id} />;
}
