"use client";

import React, { useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, Video, Music, Image as ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaPreviewProps {
  file?: File | null;
  url?: string | null;
  onClear?: () => void;
  type: "media" | "audio";
}

export function MediaLivePreview({ file, url, onClear, type }: MediaPreviewProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setObjectUrl(url);
      return () => {
        URL.revokeObjectURL(url);
      };
    } else if (url) {
      setObjectUrl(url);
    } else {
      setObjectUrl(null);
    }
  }, [file, url]);

  if (!objectUrl) return null;

  const isVideo = file ? file.type.startsWith("video/") : (url?.match(/\.(mp4|webm|ogg|mov)$/i) || false);
  const isImage = file ? file.type.startsWith("image/") : (url?.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i) || false);

  if (type === "media") {
    return (
      <div className="relative rounded-lg border border-border bg-muted/40 p-3 mt-2 overflow-hidden space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground pb-1">
          <span className="flex items-center gap-1.5">
            {isVideo ? <Video className="h-4 w-4 text-primary" /> : <ImageIcon className="h-4 w-4 text-emerald-400" />}
            {isVideo ? "Video Preview" : "Image Preview"}
            {file && <span className="font-normal">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>}
          </span>
          {onClear && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={onClear}
              title="Remove file"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <div className="relative rounded-md overflow-hidden bg-black/60 flex items-center justify-center max-h-64 aspect-video">
          {isVideo ? (
            <video
              ref={videoRef}
              src={objectUrl}
              controls
              playsInline
              className="max-h-64 w-full object-contain"
            />
          ) : (
            <img src={objectUrl} alt="Preview" className="max-h-64 w-full object-contain" />
          )}
        </div>
      </div>
    );
  }

  // Audio preview
  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const toggleMuteAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  return (
    <div className="relative rounded-lg border border-border bg-muted/40 p-3 mt-2 space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground pb-1">
        <span className="flex items-center gap-1.5">
          <Music className="h-4 w-4 text-sky-400" />
          Audio Preview
          {file && <span className="font-normal">({(file.size / (1024 * 1024)).toFixed(2)} MB)</span>}
        </span>
        {onClear && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={onClear}
            title="Remove file"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3 bg-background/60 p-2.5 rounded-md border border-border">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-8 w-8 shrink-0 text-foreground"
          onClick={togglePlayAudio}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
        </Button>

        <audio
          ref={audioRef}
          src={objectUrl}
          onEnded={() => setIsPlaying(false)}
          className="w-full h-8 accent-primary"
          controls
        />

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          onClick={toggleMuteAudio}
        >
          {isMuted ? <VolumeX className="h-4 w-4 text-destructive" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
