"use server";
import Stripe from "stripe";
import { auth, currentUser } from "@clerk/nextjs/server";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil",
});

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
          currency: "usd",
          product_data: {
            name: `${credits} AICommit Credits`,
            description:
              "Credits for AICommit to generate commit messages and more.",
          },
          unit_amount: Math.floor((credits / 50) * 100),
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
