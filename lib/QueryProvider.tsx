"use client";

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from './react-query';

const queryClient = getQueryClient();

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
