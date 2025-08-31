import { NextRequest, NextResponse } from "next/server";
import cloudinary from "@/lib/cloudinary";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const folder: string = body.folder || "meetings";
    const resource_type: "image" | "video" | "raw" | "auto" = body.resource_type || "auto";
    const public_id: string | undefined = body.public_id;

    const timestamp = Math.floor(Date.now() / 1000);

    const paramsToSign: Record<string, any> = { timestamp, folder };
    if (public_id) paramsToSign.public_id = public_id;

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET as string
    );

    return NextResponse.json({
      timestamp,
      folder,
      resource_type,
      public_id,
      apiKey: process.env.CLOUDINARY_API_KEY,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      signature,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Failed to sign" }, { status: 500 });
  }
}
