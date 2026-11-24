import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportScreen } from "./report-screen";

export const metadata: Metadata = { title: "Denúncia" };

export default function ReportPage({ params }: PageProps<"/admin/denuncias/[id]">) {
  return (
    <Suspense>
      <Report params={params} />
    </Suspense>
  );
}

async function Report({ params }: { params: PageProps<"/admin/denuncias/[id]">["params"] }) {
  const { id } = await params;
  return <ReportScreen id={id} />;
}
