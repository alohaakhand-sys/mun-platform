import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isCountryCode } from "@/lib/data/countries";

const FLAGS_DIR = path.join(process.cwd(), "src", "flags");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const normalized = (code || "").toLowerCase().replace(/\.webp$/, "");

  if (!isCountryCode(normalized)) {
    return NextResponse.json({ error: "Unknown country code" }, { status: 404 });
  }

  const filePath = path.join(FLAGS_DIR, `${normalized}.webp`);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(FLAGS_DIR))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const buf = await fs.readFile(resolved);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Flag not found" }, { status: 404 });
  }
}
