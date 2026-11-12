import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import axios from "axios";

interface ServiceTestResult {
  service: string;
  name: string;
  status: "connected" | "error" | "warning";
  latencyMs: number;
  message: string;
  details?: any;
}

export async function GET() {
  const results: ServiceTestResult[] = [];

  // 1. Test Firebase Realtime Database
  const rtdbStartTime = Date.now();
  try {
    const rtdbUrl = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
    if (!rtdbUrl) {
      throw new Error("NEXT_PUBLIC_FIREBASE_DATABASE_URL is not configured");
    }

    // Ping Firebase RTDB REST endpoint
    const response = await fetch(`${rtdbUrl}/.json?shallow=true`, {
      method: "GET",
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - rtdbStartTime;
    if (response.ok || response.status === 401 || response.status === 403) {
      // 401/403 means database is alive and reachable, but rules require auth
      results.push({
        service: "firebase_rtdb",
        name: "Firebase Realtime Database",
        status: "connected",
        latencyMs: latency,
        message: response.ok ? "Connected & Accessible" : "Reachable (Secured with Security Rules)",
      });
    } else {
      results.push({
        service: "firebase_rtdb",
        name: "Firebase Realtime Database",
        status: "error",
        latencyMs: latency,
        message: `HTTP ${response.status}: ${response.statusText}`,
      });
    }
  } catch (error: any) {
    results.push({
      service: "firebase_rtdb",
      name: "Firebase Realtime Database",
      status: "error",
      latencyMs: Date.now() - rtdbStartTime,
      message: error.message || "Failed to reach Realtime Database",
    });
  }

  // 2. Test Firebase Storage
  const storageStartTime = Date.now();
  try {
    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket) {
      throw new Error("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not configured");
    }

    const response = await fetch(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    const latency = Date.now() - storageStartTime;
    if (response.ok || response.status === 401 || response.status === 403) {
      results.push({
        service: "firebase_storage",
        name: "Firebase Storage",
        status: "connected",
        latencyMs: latency,
        message: "Bucket reachable & active",
      });
    } else {
      results.push({
        service: "firebase_storage",
        name: "Firebase Storage",
        status: "error",
        latencyMs: latency,
        message: `HTTP ${response.status}: ${response.statusText}`,
      });
    }
  } catch (error: any) {
    results.push({
      service: "firebase_storage",
      name: "Firebase Storage",
      status: "error",
      latencyMs: Date.now() - storageStartTime,
      message: error.message || "Failed to reach Firebase Storage",
    });
  }

  // 3. Test Cloudflare R2
  const r2StartTime = Date.now();
  try {
    const {
      R2_ACCESS_KEY_ID,
      R2_SECRET_ACCESS_KEY,
      R2_ENDPOINT,
      R2_BUCKET_NAME,
    } = process.env;

    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET_NAME) {
      throw new Error("Missing Cloudflare R2 credentials (ACCESS_KEY, SECRET_KEY, ENDPOINT, or BUCKET_NAME)");
    }

    const s3Client = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });

    // List 1 key to verify credentials and bucket access
    await s3Client.send(new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      MaxKeys: 1,
    }));

    const latency = Date.now() - r2StartTime;
    results.push({
      service: "cloudflare_r2",
      name: "Cloudflare R2 Storage",
      status: "connected",
      latencyMs: latency,
      message: `Connected successfully to bucket '${R2_BUCKET_NAME}'`,
    });
  } catch (error: any) {
    results.push({
      service: "cloudflare_r2",
      name: "Cloudflare R2 Storage",
      status: "error",
      latencyMs: Date.now() - r2StartTime,
      message: error.message || "Failed to connect to Cloudflare R2",
    });
  }

  // 4. Test GitHub Storage
  const ghStartTime = Date.now();
  try {
    const {
      GITHUB_TOKEN,
      GITHUB_USERNAME,
      GITHUB_REPO,
    } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_USERNAME || !GITHUB_REPO) {
      throw new Error("Missing GitHub credentials (GITHUB_TOKEN, GITHUB_USERNAME, or GITHUB_REPO)");
    }

    const response = await axios.get(`https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      timeout: 5000,
    });

    const latency = Date.now() - ghStartTime;
    results.push({
      service: "github_storage",
      name: "GitHub Storage",
      status: "connected",
      latencyMs: latency,
      message: `Authenticated as '${GITHUB_USERNAME}', repository '${GITHUB_REPO}' accessible`,
    });
  } catch (error: any) {
    results.push({
      service: "github_storage",
      name: "GitHub Storage",
      status: "error",
      latencyMs: Date.now() - ghStartTime,
      message: error.response?.data?.message || error.message || "Failed to authenticate with GitHub",
    });
  }

  // 5. Test Local Storage Directory
  const localStartTime = Date.now();
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const testDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(testDir, { recursive: true });
    const testFile = path.join(testDir, ".write-test");
    await fs.writeFile(testFile, "ok");
    await fs.unlink(testFile);

    results.push({
      service: "local_storage",
      name: "Local Disk Storage",
      status: "connected",
      latencyMs: Date.now() - localStartTime,
      message: "Local directory 'public/uploads' read/write ready",
    });
  } catch (error: any) {
    results.push({
      service: "local_storage",
      name: "Local Disk Storage",
      status: "error",
      latencyMs: Date.now() - localStartTime,
      message: error.message || "Cannot write to local uploads directory",
    });
  }

  const allConnected = results.every(r => r.status === "connected");

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    allConnected,
    results,
  });
}

