import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const DESIGNS_PATH = path.join(process.cwd(), "public", "designs.json");

export async function GET() {
  try {
    const data = await fs.readFile(DESIGNS_PATH, "utf-8");
    return NextResponse.json(JSON.parse(data));
  } catch (error: any) {
    console.error("Failed to read designs.json:", error);
    return NextResponse.json({ error: "Could not load designs" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid designs format. Expected array." }, { status: 400 });
    }

    await fs.writeFile(DESIGNS_PATH, JSON.stringify(body, null, 2), "utf-8");
    return NextResponse.json({ success: true, message: "Designs saved successfully to local public/designs.json" });
  } catch (error: any) {
    console.error("Failed to save designs.json:", error);
    return NextResponse.json({ error: "Failed to save designs", details: error.message }, { status: 500 });
  }
}

