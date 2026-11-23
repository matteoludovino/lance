import type { Metadata } from "next";
import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "Seu perfil" };

export default function EditProfilePage() {
  return <ProfileEditor />;
}
