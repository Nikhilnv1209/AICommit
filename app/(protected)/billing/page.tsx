"use client";

import { getUserCredits } from "@/app/actions";
import { createCheckoutSession } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <h1 className="text-2xl font-bold mb-6">Billing</h1>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
        {/* Left side: Purchase credits */}
        <div className="lg:col-span-3">
          <div className="p-6 border rounded-lg bg-card h-full flex flex-col">
            <h2 className="text-xl font-semibold">Buy More Credits</h2>
            <div className="flex-grow flex flex-col justify-center py-8">
              <Slider
                defaultValue={[50]}
                min={10}
                max={1000}
                step={1}
                onValueChange={(value) => setCreditsToBuy(value[0])}
              />
              <div className="text-center mt-6">
                  <p className="text-3xl font-bold">{creditsToBuy} credits</p>
                  <p className="text-muted-foreground text-sm">for</p>
                  <p className="text-4xl font-extrabold text-primary">${calculatedPrice}</p>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={handlePurchase}
              disabled={isCreatingSession}
              size="lg"
            >
              {isCreatingSession ? (
                <Loader2 className="animate-spin mr-2" />
              ) : (
                <><CreditCard className="mr-2 h-5 w-5"/> Purchase Credits</>
              )}
            </Button>
          </div>
        </div>

        {/* Right side: Info */}
        <div className="lg:col-span-2">
            <Card className="h-full flex flex-col">
                <CardHeader>
                    <CardTitle>Your Credits</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingCredits ? (
                        <div className="h-10 w-28 animate-pulse rounded-md bg-muted" />
                    ) : (
                        <p className="text-5xl font-bold">
                        {data?.credits ?? 0}
                        </p>
                    )}
                </CardContent>
                <div className="px-6 flex-grow">
                    <Separator />
                </div>
                <CardContent className="pt-6 text-sm">
                    <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 mt-0.5 flex-shrink-0 text-muted-foreground" />
                        <div>
                            <h3 className="font-semibold mb-2">How credits work</h3>
                            <p className="text-muted-foreground">
                            Credits are used for various AI-powered tasks within AICommit.
                            </p>
                            <ul className="list-disc pl-5 mt-2 space-y-1 text-muted-foreground">
                            <li><strong>1 credit</strong> = Indexing 1 file from your repository.</li>
                            </ul>
                            <p className="text-muted-foreground mt-2">
                            <em>Example: A repository with 150 files will require 150 credits to be fully indexed.</em>
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  );
};

export default BillingPage;
