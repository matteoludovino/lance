"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { RealtimeProvider } from "@/lib/realtime";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <RealtimeProvider>{children}</RealtimeProvider>
    </QueryClientProvider>
  );
}
