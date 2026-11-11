import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireUid } from "@/lib/server/migrationServer";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export async function POST(request: NextRequest) {
  try {
    // Signed-in members only: an open route let anyone fill the platform's Cloudinary account.
    if (!(await requireUid(request))) {
      return NextResponse.json({ error: "Sign in to upload images." }, { status: 401 });
    }
    if (
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    ) {
      console.error("Cloudinary credentials are not configured in .env.local");
      return NextResponse.json(
        { error: "Image upload service is not configured." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No image file provided." },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Invalid file type. Only images are accepted." },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Image must be less than 10MB." },
        { status: 400 }
      );
    }

    // Convert file to a data URI Cloudinary accepts
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUri = `data:${file.type};base64,${base64}`;

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "mun-platform",
      resource_type: "image",
    });

    // f_auto = auto format (webp/avif), q_auto = auto quality — smaller thumb
    const thumb = cloudinary.url(result.public_id, {
      secure: true,
      transformation: [
        { width: 400, height: 400, crop: "limit" },
        { fetch_format: "auto", quality: "auto" },
      ],
    });

    return NextResponse.json({
      url: result.secure_url,
      thumb,
      publicId: result.public_id,
    });
  } catch (error: any) {
    console.error("Cloudinary upload failed:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to upload image to hosting service." },
      { status: 502 }
    );
  }
}
