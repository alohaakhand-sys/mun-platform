import { NextResponse } from "next/server";
import { COUNTRIES, flagUrl, searchCountries } from "@/lib/data/countries";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const list = q ? searchCountries(q) : COUNTRIES;
  return NextResponse.json({
    count: list.length,
    countries: list.map(c => ({ code: c.code, name: c.name, flag: flagUrl(c.code) })),
  });
}
