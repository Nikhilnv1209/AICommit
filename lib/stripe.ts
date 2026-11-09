"use server";
import Stripe from "stripe";
import { auth, currentUser } from "@clerk/nextjs/server";
import { currencyMultiplier, normalizeCurrency } from "./currency";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

// Stripe accepts any 3-letter ISO code; configure via NEXT_PUBLIC_ so the
// billing screen can format the same currency without a round-trip.
const CURRENCY = normalizeCurrency(process.env.NEXT_PUBLIC_STRIPE_CURRENCY);

export async function createCheckoutSession(credits: number) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("User not authenticated");
  }

  const user = await currentUser();
  const userEmail = user?.emailAddresses[0]?.emailAddress;

  const checkoutSession = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: CURRENCY,
          product_data: {
            name: `${credits} AICommit Credits`,
            description:
              "Credits for AICommit to generate commit messages and more.",
          },
          // 50 credits = 1 major unit; convert to the currency's smallest unit.
          unit_amount: Math.round((credits / 50) * currencyMultiplier(CURRENCY)),
        },
        quantity: 1,
      },
    ],
    customer_creation: "always",
    mode: "payment",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/create`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
    customer_email: userEmail,
    client_reference_id: userId,
    metadata: {
      userId,
      credits,
    },
  });

  return { url: checkoutSession.url! };
}
