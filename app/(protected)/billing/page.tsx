"use client";

import { getUserCredits } from "@/app/actions";
import { createCheckoutSession } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Info, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";
import { Separator } from "@/components/ui/separator";

const BillingPage = () => {
  const [creditsToBuy, setCreditsToBuy] = useState(50);

  const { data, isLoading: isLoadingCredits } = useQuery({
    queryKey: ["userCredits"],
    queryFn: async () => await getUserCredits(),
  });

  const { mutate: createSession, isPending: isCreatingSession } = useMutation({
    mutationFn: createCheckoutSession,
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error("Could not create a checkout session.");
      }
    },
    onError: (error) => {
      toast.error(error.message || "An unexpected error occurred.");
    },
  });

  const handlePurchase = () => {
    createSession(creditsToBuy);
  };

  const calculatedPrice = (creditsToBuy / 50).toFixed(2);

  return (
    <div className="w-full">
      <h1 className="font-mono text-2xl font-medium tracking-tight">billing</h1>
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* Purchase credits */}
        <div className="lg:col-span-3">
          <div className="flex h-full flex-col rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <span className="font-mono text-[11px] text-primary">{"// buy credits"}</span>
            </div>
            <div className="flex flex-grow flex-col justify-center p-6">
              <Slider
                defaultValue={[50]}
                min={10}
                max={1000}
                step={1}
                onValueChange={(value) => setCreditsToBuy(value[0])}
              />
              <div className="mt-8 text-center">
                <p className="font-mono text-3xl font-medium tabular-nums">{creditsToBuy}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">credits</p>
                <p className="mt-4 font-mono text-4xl font-medium tabular-nums text-primary">
                  ${calculatedPrice}
                </p>
              </div>
            </div>
            <div className="p-6 pt-0">
              <Button
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={handlePurchase}
                disabled={isCreatingSession}
                size="lg"
              >
                {isCreatingSession ? (
                  <Loader2 className="mr-2 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="mr-2 h-5 w-5" /> Purchase
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Current credits + info */}
        <div className="lg:col-span-2">
          <div className="flex h-full flex-col rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-3">
              <span className="font-mono text-[11px] text-primary">{"// your balance"}</span>
            </div>
            <div className="p-6">
              {isLoadingCredits ? (
                <div className="h-12 w-28 animate-pulse rounded-md bg-muted" />
              ) : (
                <p className="font-mono text-5xl font-medium tabular-nums">
                  {data?.credits ?? 0}
                </p>
              )}
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">credits available</p>
            </div>
            <Separator />
            <div className="p-6">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="mb-2 font-mono text-xs font-medium">how credits work</h3>
                  <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                    Credits are used for AI-powered tasks within AICommit.
                  </p>
                  <ul className="mt-2 space-y-1 pl-4 font-mono text-[11px] text-muted-foreground">
                    <li>
                      <strong>1 credit</strong> = indexing 1 file from your repository.
                    </li>
                  </ul>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    <em>Example: a 150-file repo requires 150 credits to fully index.</em>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
