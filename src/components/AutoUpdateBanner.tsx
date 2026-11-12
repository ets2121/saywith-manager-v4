"use client";

import { useEffect, useState } from "react";
import { Sparkles, Download, RefreshCw, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

declare global {
  interface Window {
    electronAPI?: {
      isElectron?: boolean;
      platform?: string;
      version?: string;
      onUpdateAvailable?: (callback: (info: any) => void) => void;
      onUpdateProgress?: (callback: (progress: any) => void) => void;
      onUpdateDownloaded?: (callback: (info: any) => void) => void;
      onUpdateError?: (callback: (err: any) => void) => void;
      checkForUpdates?: () => Promise<any>;
      restartAndInstall?: () => Promise<void>;
    };
  }
}

export function AutoUpdateBanner() {
  const [isElectron, setIsElectron] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.isElectron) {
      setIsElectron(true);

      window.electronAPI.onUpdateAvailable?.((info) => {
        setUpdateAvailable(true);
        setUpdateInfo(info);
        setDismissed(false);
      });

      window.electronAPI.onUpdateProgress?.((progress) => {
        const pct = Math.round(progress.percent || 0);
        setDownloadProgress(pct);
      });

      window.electronAPI.onUpdateDownloaded?.((info) => {
        setUpdateDownloaded(true);
        setUpdateInfo(info);
        setDismissed(false);
      });
    }
  }, []);

  if (!isElectron || dismissed || (!updateAvailable && !updateDownloaded)) {
    return null;
  }

  const handleRestart = () => {
    window.electronAPI?.restartAndInstall?.();
  };

  return (
    <div className="w-full bg-gradient-to-r from-primary/20 via-primary/10 to-accent/20 border-b border-primary/30 p-3 text-foreground animate-in slide-in-from-top duration-300">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {updateDownloaded ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <Sparkles className="h-5 w-5 text-primary shrink-0 animate-pulse" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {updateDownloaded
                ? `Update v${updateInfo?.version || ""} is ready to install!`
                : `New Release Detected (v${updateInfo?.version || ""})`}
            </p>
            <p className="text-xs text-muted-foreground">
              {updateDownloaded
                ? "Restart now to apply the seamless update."
                : `Downloading in background (${downloadProgress}%)...`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          {!updateDownloaded && (
            <div className="w-24 sm:w-32 mr-2">
              <Progress value={downloadProgress} className="h-2" />
            </div>
          )}

          {updateDownloaded ? (
            <Button
              size="sm"
              onClick={handleRestart}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 h-8 text-xs font-semibold"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Restart &amp; Install
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Download className="h-3.5 w-3.5 animate-bounce" />
              Downloading
            </span>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDismissed(true)}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

