import { NextRequest, NextResponse } from "next/server";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mime from "mime-types";

function getS3Client() {
  const {
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_ENDPOINT,
  } = process.env;

  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
    throw new Error("Missing Cloudflare R2 credentials in environment variables.");
  }

  return new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
}

async function uploadToR2(s3Client: S3Client, bucketName: string, path: string, contentBuffer: Buffer, originalname: string) {
  const contentType = mime.lookup(originalname) || "application/octet-stream";

  const uploadParams = {
    Bucket: bucketName,
    Key: path,
    Body: contentBuffer,
    ContentType: contentType,
    CacheControl: "public, max-age=604800, immutable",
  };

  await s3Client.send(new PutObjectCommand(uploadParams));
  return path;
}

async function generateSignedUrl(s3Client: S3Client, bucketName: string, filePath: string) {
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: filePath,
  });

  return await getSignedUrl(s3Client, command, {
    expiresIn: 604800, // 7 days
  });
}

export async function POST(req: NextRequest) {
  try {
    const bucketName = process.env.R2_BUCKET_NAME;
    if (!bucketName) {
      return NextResponse.json({ error: "R2_BUCKET_NAME is not configured" }, { status: 500 });
    }

    const s3Client = getS3Client();
    const formData = await req.formData();
    const folder = (formData.get("folder") as string) || "uploads";

    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 && !file2) {
      return NextResponse.json({ error: "At least one file (file1 or file2) is required" }, { status: 400 });
    }

    const results: { R2mediaPath?: string; R2audioPath?: string } = {};
    const signedUrls: { file1?: string; file2?: string } = {};

    if (file1) {
      const file1Path = `${folder}/${file1.name}`;
      const buffer = Buffer.from(await file1.arrayBuffer());
      results.R2mediaPath = await uploadToR2(s3Client, bucketName, file1Path, buffer, file1.name);
      signedUrls.file1 = await generateSignedUrl(s3Client, bucketName, file1Path);
    }

    if (file2) {
      const file2Path = `${folder}/${file2.name}`;
      const buffer = Buffer.from(await file2.arrayBuffer());
      results.R2audioPath = await uploadToR2(s3Client, bucketName, file2Path, buffer, file2.name);
      signedUrls.file2 = await generateSignedUrl(s3Client, bucketName, file2Path);
    }

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);

    return NextResponse.json({
      success: true,
      message: "Files uploaded successfully to Cloudflare R2",
      R2mediaPath: results.R2mediaPath || null,
      R2audioPath: results.R2audioPath || null,
      R2mediaEXP: expirationDate.toISOString(),
      R2audioEXP: expirationDate.toISOString(),
      file1URL: signedUrls.file1 || null,
      file2URL: signedUrls.file2 || null,
    });
  } catch (error: any) {
    console.error("R2 Upload error:", error);
    return NextResponse.json({
      error: "Upload failed",
      details: error.message || "Unknown error",
    }, { status: 500 });
  }
}

