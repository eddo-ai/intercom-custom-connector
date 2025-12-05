import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    testModeAvailable: !!process.env.INTERCOM_ACCESS_TOKEN_TEST,
  });
}

