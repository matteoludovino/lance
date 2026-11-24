import type { Metadata } from "next";
import { NewProject } from "./new-project";

export const metadata: Metadata = { title: "Publicar projeto" };

export default function NewProjectPage() {
  return <NewProject />;
}
