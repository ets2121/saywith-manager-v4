import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

const GITHUB_API = "https://api.github.com";

async function uploadToGitHub(filePath: string, contentBuffer: Buffer) {
  const {
    GITHUB_TOKEN,
    GITHUB_USERNAME,
    GITHUB_REPO,
    GITHUB_BRANCH = "main",
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_USERNAME || !GITHUB_REPO) {
    throw new Error("Missing GitHub storage credentials in environment variables.");
  }

  const url = `${GITHUB_API}/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${filePath}`;
  const contentBase64 = contentBuffer.toString("base64");

  // Check if file exists to obtain existing SHA
  let sha: string | null = null;
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });
    sha = res.data.sha;
  } catch (e: any) {
    if (e.response?.status !== 404) {
      throw e;
    }
  }

  await axios.put(
    url,
    {
      message: `Upload ${filePath} via SayWith Manager`,
      content: contentBase64,
      branch: GITHUB_BRANCH,
      ...(sha && { sha }),
    },
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );

  return `https://raw.githubusercontent.com/${GITHUB_USERNAME}/${GITHUB_REPO}/${GITHUB_BRANCH}/${filePath}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const folder = (formData.get("folder") as string) || "uploads";

    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 && !file2) {
      return NextResponse.json({ error: "At least one file (file1 or file2) is required" }, { status: 400 });
    }

    const results: { file1URL?: string; file2URL?: string } = {};

    if (file1) {
      const file1Path = `${folder}/${file1.name}`;
      const buffer = Buffer.from(await file1.arrayBuffer());
      results.file1URL = await uploadToGitHub(file1Path, buffer);
    }

    if (file2) {
      const file2Path = `${folder}/${file2.name}`;
      const buffer = Buffer.from(await file2.arrayBuffer());
      results.file2URL = await uploadToGitHub(file2Path, buffer);
    }

    return NextResponse.json({
      success: true,
      message: "Files uploaded successfully to GitHub Storage",
      ...results,
    });
  } catch (error: any) {
    console.error("GitHub upload error:", error.response?.data || error);
    return NextResponse.json({
      error: "Upload failed",
      details: error.response?.data?.message || error.message || "Unknown error",
    }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const {
      GITHUB_TOKEN,
      GITHUB_USERNAME,
      GITHUB_REPO,
      GITHUB_BRANCH = "main",
    } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_USERNAME || !GITHUB_REPO) {
      return NextResponse.json({ error: "Missing GitHub credentials in environment variables." }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { path: filePath, folder } = body;

    const headers = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
    };

    const deleteSingleFile = async (targetPath: string) => {
      const cleanPath = targetPath.replace(/^https?:\/\/raw\.githubusercontent\.com\/[^\/]+\/[^\/]+\/[^\/]+\//, "");
      const url = `${GITHUB_API}/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${cleanPath}`;
      try {
        const res = await axios.get(url, { headers });
        const sha = res.data.sha;
        if (sha) {
          await axios.delete(url, {
            headers,
            data: {
              message: `Delete ${cleanPath} via SayWith Manager`,
              sha,
              branch: GITHUB_BRANCH,
            },
          });
        }
      } catch (e: any) {
        if (e.response?.status !== 404) throw e;
      }
    };

    if (filePath) {
      await deleteSingleFile(filePath);
    }

    if (folder) {
      const folderUrl = `${GITHUB_API}/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${folder}`;
      try {
        const res = await axios.get(folderUrl, { headers });
        if (Array.isArray(res.data)) {
          for (const item of res.data) {
            if (item.type === "file" && item.sha) {
              const fileUrl = `${GITHUB_API}/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${item.path}`;
              await axios.delete(fileUrl, {
                headers,
                data: {
                  message: `Delete ${item.path} via SayWith Manager`,
                  sha: item.sha,
                  branch: GITHUB_BRANCH,
                },
              });
            }
          }
        }
      } catch (e: any) {
        if (e.response?.status !== 404) throw e;
      }
    }

    return NextResponse.json({ success: true, message: "File(s) deleted from GitHub storage." });
  } catch (error: any) {
    console.error("GitHub delete error:", error.response?.data || error);
    return NextResponse.json({
      error: "Delete failed",
      details: error.response?.data?.message || error.message || "Unknown error",
    }, { status: 500 });
  }
}

