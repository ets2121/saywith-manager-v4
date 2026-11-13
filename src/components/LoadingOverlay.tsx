"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface LoadingOverlayProps {
  open: boolean;
  title?: string;
  description?: string;
  /** 0-100 to show a progress bar; null/undefined shows indeterminate spinner only */
  progress?: number | null;
  /** Extra class names for the panel card */
  className?: string;
}

/**
 * Full-viewport modal loading overlay.
 * Blocks interaction and focuses the panel for accessibility.
 * No close button — the caller controls `open`.
 */
export function LoadingOverlay({
  open,
  title = "Please wait…",
  description,
  progress,
  className,
}: LoadingOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  /* Focus the panel when it opens so screen-readers announce it */
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  /* Prevent scroll on body while overlay is open */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const hasProgress = progress != null;

  return (
    /* Backdrop */
    <div
      className="overlay-animate-in fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "panel-animate-in outline-none",
          "w-[min(90vw,360px)] rounded-2xl border border-primary/20",
          "bg-card/95 backdrop-blur-md shadow-2xl shadow-black/40",
          "p-8 flex flex-col items-center gap-5",
          className
        )}
      >
        {/* Spinner ring */}
        <div className="relative flex items-center justify-center">
          {/* Glow behind spinner */}
          <div className="absolute h-16 w-16 rounded-full bg-primary/15 blur-xl" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-background/60">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </div>

        {/* Title */}
        <div className="text-center space-y-1.5">
          <p className="text-base font-semibold text-foreground leading-snug">{title}</p>

          {description && (
            <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px] mx-auto">
              {description}
            </p>
          )}
        </div>

        {/* Progress bar OR bouncing dots */}
        {hasProgress ? (
          <div className="w-full space-y-2">
            <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
              <span>Uploading…</span>
              <span className="tabular-nums text-primary">{progress}%</span>
            </div>
            <Progress
              value={progress ?? 0}
              className="h-2 rounded-full bg-muted [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-accent [&>div]:transition-all [&>div]:duration-300"
            />
          </div>
        ) : (
          /* Bouncing dots for indeterminate state */
          <div className="flex items-end gap-1.5 h-5">
            <span className="dot-1 h-2 w-2 rounded-full bg-primary" />
            <span className="dot-2 h-2 w-2 rounded-full bg-primary" />
            <span className="dot-3 h-2 w-2 rounded-full bg-primary" />
          </div>
        )}
      </div>
    </div>
  );
}

