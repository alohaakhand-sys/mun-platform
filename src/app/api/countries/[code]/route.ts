import { NextResponse } from "next/server";
import { getCountry, flagUrl } from "@/lib/data/countries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const country = getCountry(code);
  if (!country) {
    return NextResponse.json({ error: "Country not found" }, { status: 404 });
  }
  return NextResponse.json({
    code: country.code,
    name: country.name,
    flag: flagUrl(country.code),
  });
}
