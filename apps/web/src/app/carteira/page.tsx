import type { Metadata } from "next";
import { Wallet } from "./wallet";

export const metadata: Metadata = { title: "Carteira" };

export default function WalletPage() {
  return <Wallet />;
}
