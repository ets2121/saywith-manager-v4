import { storage } from "@/lib/firebase";
import { ref as storageRef, deleteObject } from "firebase/storage";

export type StorageProviderType = "r2" | "firebase" | "github" | "local";

/**
 * Delete a single file from the designated storage provider.
 */
export async function deleteStorageFile({
  provider,
  filePath,
  fileUrl,
}: {
  provider: StorageProviderType;
  filePath?: string | null;
  fileUrl?: string | null;
}): Promise<boolean> {
  try {
    if (provider === "firebase") {
      const target = fileUrl || filePath;
      if (target && !target.includes("default-audio.mp3")) {
        try {
          const fileRef = storageRef(storage, target);
          await deleteObject(fileRef);
          return true;
        } catch (err: any) {
          if (err.code !== "storage/object-not-found") {
            console.warn("Firebase file delete error:", err);
          }
        }
      }
      return false;
    }

    if (provider === "r2") {
      const targetPath = filePath || (fileUrl ? extractPathFromUrl(fileUrl) : null);
      if (!targetPath) return false;

      const res = await fetch("/api/storage/r2", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath }),
      });
      return res.ok;
    }

    if (provider === "local") {
      const targetPath = filePath || fileUrl;
      if (!targetPath || targetPath.includes("default-audio.mp3")) return false;

      const res = await fetch("/api/storage/local", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath }),
      });
      return res.ok;
    }

    if (provider === "github") {
      const targetPath = filePath || fileUrl;
      if (!targetPath || targetPath.includes("default-audio.mp3")) return false;

      const res = await fetch("/api/storage/github", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: targetPath }),
      });
      return res.ok;
    }

    return false;
  } catch (err) {
    console.warn(`Failed to delete storage file (${provider}):`, err);
    return false;
  }
}

/**
 * Delete all files or folder associated with an entire entry ID.
 */
export async function deleteStorageEntry({
  provider,
  folder,
  mediaUrl,
  audioUrl,
  R2mediaPath,
  R2audioPath,
}: {
  provider: StorageProviderType;
  folder: string;
  mediaUrl?: string | null;
  audioUrl?: string | null;
  R2mediaPath?: string | null;
  R2audioPath?: string | null;
}): Promise<boolean> {
  try {
    if (provider === "r2") {
      const res = await fetch("/api/storage/r2", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      return res.ok;
    }

    if (provider === "local") {
      const res = await fetch("/api/storage/local", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      return res.ok;
    }

    if (provider === "github") {
      const res = await fetch("/api/storage/github", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder }),
      });
      return res.ok;
    }

    if (provider === "firebase") {
      // In Firebase, delete both media and audio if URLs are present
      if (mediaUrl) {
        try {
          await deleteObject(storageRef(storage, mediaUrl));
        } catch {}
      }
      if (audioUrl && !audioUrl.includes("default-audio.mp3")) {
        try {
          await deleteObject(storageRef(storage, audioUrl));
        } catch {}
      }
      return true;
    }

    return false;
  } catch (err) {
    console.warn(`Failed to delete storage entry folder (${provider}):`, err);
    return false;
  }
}

function extractPathFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    // remove leading slash
    return parsed.pathname.replace(/^\//, "");
  } catch {
    return null;
  }
}
