import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/prisma/client";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-08-27.basil"
})

export async function POST(req: NextRequest) {
  const body = await req.text();
  // Use the request headers directly to avoid async `headers()` typing issues
  const signature = req.headers.get("Stripe-Signature") as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (error: any) {
    return new NextResponse(`Webhook Error: ${error.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    if (!session?.metadata?.userId) {
      return new NextResponse("User ID not found in session metadata", {
        status: 400,
      });
    }

    if (!session?.metadata?.credits) {
        return new NextResponse("Credits not found in session metadata", {
            status: 400,
        });
    }

    const userId = session.metadata.userId;
    const credits = parseInt(session.metadata.credits);

    try {
      await prisma.$transaction([
        prisma.user.update({
          where: {
            id: userId,
          },
          data: {
            credits: {
              increment: credits,
            },
          },
        }),
        prisma.stripeTransaction.create({
          data: {
            userId: userId,
            credits: credits,
          },
        }),
      ]);
    } catch (error: any) {
        return new NextResponse(`Database Error: ${error.message}`, { status: 500 });
    }
  }

  return new NextResponse(null, { status: 200 });
}
