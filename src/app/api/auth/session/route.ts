import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return NextResponse.json({ error: "Missing ID token" }, { status: 400 });
    }

    const expiresIn = 60 * 60 * 24 * 5 * 1000; // 5 days
    const sessionCookie = await adminAuth.createSessionCookie(idToken, { expiresIn });

    const response = NextResponse.json({ status: "success" }, { status: 200 });

    response.cookies.set("session", sessionCookie, {
      maxAge: expiresIn / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    return response;
  } catch (error: any) {
    console.error("Session creation error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ status: "success" }, { status: 200 });
  response.cookies.set("session", "", {
    maxAge: 0,
    path: "/",
  });
  return response;
}
