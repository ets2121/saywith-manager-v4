import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { pin } = await req.json();
    const correctPin = process.env.PIN_CODE || process.env.NEXT_PUBLIC_PIN_CODE || "2121";

    if (!pin) {
      return NextResponse.json({ error: "PIN is required" }, { status: 400 });
    }

    if (String(pin).trim() === String(correctPin).trim()) {
      return NextResponse.json({ success: true, message: "PIN verified" });
    } else {
      return NextResponse.json({ success: false, error: "Incorrect PIN" }, { status: 401 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: "Verification failed", details: error.message }, { status: 500 });
  }
}
