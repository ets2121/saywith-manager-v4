import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const folder = (formData.get("folder") as string) || "general";
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 && !file2) {
      return NextResponse.json({ error: "At least one file is required" }, { status: 400 });
    }

    const targetDir = path.join(process.cwd(), "public", "uploads", folder);
    await fs.mkdir(targetDir, { recursive: true });

    const results: { file1URL?: string; file2URL?: string } = {};

    if (file1) {
      const filePath = path.join(targetDir, file1.name);
      const buffer = Buffer.from(await file1.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      results.file1URL = `/uploads/${folder}/${file1.name}`;
    }

    if (file2) {
      const filePath = path.join(targetDir, file2.name);
      const buffer = Buffer.from(await file2.arrayBuffer());
      await fs.writeFile(filePath, buffer);
      results.file2URL = `/uploads/${folder}/${file2.name}`;
    }

    return NextResponse.json({
      success: true,
      message: "Files stored locally in public/uploads",
      ...results,
    });
  } catch (error: any) {
    console.error("Local storage error:", error);
    return NextResponse.json({ error: "Local storage failed", details: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { path: filePath, folder } = body;

    if (!filePath && !folder) {
      return NextResponse.json({ error: "Either 'path' or 'folder' is required to delete." }, { status: 400 });
    }

    const baseUploadsDir = path.join(process.cwd(), "public", "uploads");

    // 1. If folder is specified, remove the entire folder
    if (folder) {
      const sanitizedFolder = path.basename(folder);
      const folderPath = path.join(baseUploadsDir, sanitizedFolder);
      await fs.rm(folderPath, { recursive: true, force: true });
    }

    // 2. If single file path is specified (e.g. /uploads/folder/media.mp4 or folder/media.mp4)
    if (filePath) {
      const cleanPath = filePath.replace(/^\/?uploads\//, "").replace(/^\//, "");
      const fullPath = path.join(baseUploadsDir, cleanPath);
      await fs.rm(fullPath, { force: true });
    }

    return NextResponse.json({
      success: true,
      message: "Deleted local storage file(s)",
    });
  } catch (error: any) {
    console.error("Local storage delete error:", error);
    return NextResponse.json({ error: "Local delete failed", details: error.message }, { status: 500 });
  }
}

