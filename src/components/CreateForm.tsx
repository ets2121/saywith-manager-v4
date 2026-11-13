"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ref as dbRef, set, child } from "firebase/database";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Copy, QrCode } from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";
import { FileUploader } from "./FileUploader";
import { MediaLivePreview } from "./MediaLivePreview";
import { Progress } from "@/components/ui/progress";
import templates from '@/lib/templates.json';
import type { StorageProvider } from "@/app/page";

const formSchema = z.object({
  name: z.string().optional(),
  template: z.string().optional(),
  enabled: z.boolean().default(false),
  mute: z.boolean().default(false),
});

const generateUniqueId = () => {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 5);
  return (timestamp + randomPart).slice(0, 9);
};

const readFileAsText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
};

const getFileExtension = (filename: string) => {
  return filename.slice(((filename.lastIndexOf(".") - 1) >>> 0) + 2);
};

const uploadWithProgress = (url: string, formData: FormData, onProgress: (pct: number) => void): Promise<any> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(json);
        } else {
          reject(new Error(json.error || `Upload failed with status ${xhr.status}`));
        }
      } catch {
        reject(new Error("Invalid server response"));
      }
    };

    xhr.onerror = () => reject(new Error("Network connection error during upload"));
    xhr.send(formData);
  });
};

export function CreateForm({
  storageProvider,
  onOpenQr,
}: {
  storageProvider: StorageProvider;
  onOpenQr?: (id: string) => void;
}) {
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [manualTemplate, setManualTemplate] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [newId, setNewId] = useState("");
  const { toast } = useToast();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000/';

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      template: "",
      enabled: false,
      mute: false,
    },
  });

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      toast({ title: "Copied!", description: "The URL has been copied to your clipboard." });
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    setUploadProgress(0);
    setUploadStatus("Initializing upload...");

    try {
      const saywithRef = dbRef(db, 'Saywith');
      const uniqueId = generateUniqueId();
      const newSaywithRef = child(saywithRef, uniqueId);
      setNewId(uniqueId);

      const dataToSave: any = { ...values };
      dataToSave.template = manualTemplate || values.template;

      if (!audioFile) {
        dataToSave.audioUrl = '/default-audio.mp3';
      }

      const now = new Date().toISOString();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      if (storageProvider === "firebase") {
        setUploadStatus("Uploading to Firebase Storage...");
        if (mediaFile) {
          const mediaExtension = getFileExtension(mediaFile.name);
          const fileRef = storageRef(storage, `messages/${uniqueId}/media_${timestamp}.${mediaExtension}`);
          const task = uploadBytesResumable(fileRef, mediaFile);

          await new Promise<void>((resolve, reject) => {
            task.on('state_changed',
              (snapshot) => {
                const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                setUploadProgress(pct);
              },
              (error) => reject(error),
              async () => {
                dataToSave.mediaUrl = await getDownloadURL(task.snapshot.ref);
                resolve();
              }
            );
          });
        }

        if (audioFile) {
          setUploadStatus("Uploading audio track...");
          const audioExtension = getFileExtension(audioFile.name);
          const fileRef = storageRef(storage, `messages/${uniqueId}/audio_${timestamp}.${audioExtension}`);
          const task = uploadBytesResumable(fileRef, audioFile);

          await new Promise<void>((resolve, reject) => {
            task.on('state_changed',
              (snapshot) => {
                const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                setUploadProgress(pct);
              },
              (error) => reject(error),
              async () => {
                dataToSave.audioUrl = await getDownloadURL(task.snapshot.ref);
                resolve();
              }
            );
          });
        }
      } else {
        // github, r2, or local
        let uploadUrl = '/api/storage/local';
        if (storageProvider === 'github') uploadUrl = '/api/storage/github';
        else if (storageProvider === 'r2') uploadUrl = '/api/storage/r2';

        const providerLabel = storageProvider === 'r2' ? 'Cloudflare R2' : storageProvider === 'github' ? 'GitHub' : 'Local Disk';
        setUploadStatus(`Uploading to ${providerLabel}...`);

        const formData = new FormData();
        formData.append('folder', uniqueId);

        if (mediaFile) {
          const mediaExtension = getFileExtension(mediaFile.name);
          const newMediaFile = new File([mediaFile], `media_${timestamp}.${mediaExtension}`, { type: mediaFile.type });
          formData.append('file1', newMediaFile);
        }
        if (audioFile) {
          const audioExtension = getFileExtension(audioFile.name);
          const newAudioFile = new File([audioFile], `audio_${timestamp}.${audioExtension}`, { type: audioFile.type });
          formData.append('file2', newAudioFile);
        }

        if (mediaFile || audioFile) {
          const responseData = await uploadWithProgress(uploadUrl, formData, (pct) => {
            setUploadProgress(pct);
          });

          if (responseData.file1URL) dataToSave.mediaUrl = responseData.file1URL;
          if (responseData.file2URL) dataToSave.audioUrl = responseData.file2URL;
          if (responseData.R2mediaPath) dataToSave.R2mediaPath = responseData.R2mediaPath;
          if (responseData.R2audioPath) dataToSave.R2audioPath = responseData.R2audioPath;
          if (responseData.R2mediaEXP) dataToSave.R2mediaEXP = responseData.R2mediaEXP;
          if (responseData.R2audioEXP) dataToSave.R2audioEXP = responseData.R2audioEXP;
        }
      }

      setUploadStatus("Saving subtitles & database entry...");
      if (srtFile) {
        let srtContent = await readFileAsText(srtFile);
        srtContent = srtContent.replace(/Transcribed by TurboScribe\.ai\. Go Unlimited to remove this message/g, "made by SayWith");
        dataToSave.srtContent = srtContent;
      } else {
        dataToSave.srtContent = "1\n00:00:00,000 --> 00:00:05,000\nSayWith";
      }

      dataToSave.storageProvider = storageProvider;
      dataToSave.createdAt = now;
      dataToSave.updatedAt = now;

      await set(newSaywithRef, dataToSave);

      setShowSuccessDialog(true);
      copyToClipboard(`${baseUrl}${uniqueId}`);
      form.reset({ name: "", template: "", enabled: false, mute: false });
      setManualTemplate("");
      setMediaFile(null);
      setAudioFile(null);
      setSrtFile(null);
    } catch (error: any) {
      console.error("Error creating entry:", error);
      toast({
        variant: "destructive",
        title: "Creation Failed",
        description: error.message || "There was a problem with your request. Please try again.",
      });
    } finally {
      setIsLoading(false);
      setUploadProgress(null);
      setUploadStatus("");
    }
  };

  const openQrGenerator = () => {
    setShowSuccessDialog(false);
    if (onOpenQr) {
      onOpenQr(newId);
    } else {
      window.open(`/qr/${newId}`, '_blank');
    }
  };

  const isVideo = mediaFile?.type.startsWith("video/");

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle>Create New Content</CardTitle>
              <CardDescription>Fill out the form below to add a new multimedia entry to the database.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-4 space-y-6 pb-24">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content Name / Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Birthday greeting for Sarah" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-3">
                <FormField
                  control={form.control}
                  name="template"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Visual Template</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a template" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-60">
                          {templates.map(template => (
                            <SelectItem key={template.value} value={template.value}>
                              {template.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormItem>
                  <FormLabel>Manual Template Value (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. custom_template_v1"
                      value={manualTemplate}
                      onChange={(e) => setManualTemplate(e.target.value)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              </div>

              <div className="space-y-5 border-t border-border pt-4">
                <h3 className="font-semibold text-sm text-foreground">Media Assets</h3>
                <div className="space-y-3">
                  <FileUploader
                    id="media-file"
                    label="Media File (Image or Video)"
                    accept="image/*,video/*"
                    file={mediaFile}
                    onFileSelect={setMediaFile}
                  />
                  {mediaFile && (
                    <MediaLivePreview
                      file={mediaFile}
                      type="media"
                      onClear={() => setMediaFile(null)}
                    />
                  )}
                </div>

                <div className="space-y-3">
                  <FileUploader
                    id="audio-file"
                    label="Audio Track (MP3)"
                    accept="audio/mpeg,audio/mp3,audio/*"
                    file={audioFile}
                    onFileSelect={setAudioFile}
                  />
                  {audioFile && (
                    <MediaLivePreview
                      file={audioFile}
                      type="audio"
                      onClear={() => setAudioFile(null)}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <FileUploader
                    id="srt-file"
                    label="Subtitles File (.srt or .txt)"
                    accept=".srt,.txt"
                    file={srtFile}
                    onFileSelect={setSrtFile}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border p-4 bg-background/50">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Active / Published</FormLabel>
                        <FormDescription>Toggle to enable public access</FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
                {isVideo && (
                  <FormField
                    control={form.control}
                    name="mute"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border border-border p-4 bg-background/50">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Mute Video Audio</FormLabel>
                          <FormDescription>Play only the uploaded audio track</FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                )}
              </div>

              {/* Inline progress removed — popup overlay used instead */}
            </CardContent>
          </Card>

          <div className="fixed bottom-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-t border-border p-4 md:static md:p-0 md:bg-transparent md:border-0 md:mt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2 h-11 text-base font-medium"
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {isLoading ? "Saving Content..." : "Save Content"}
            </Button>
          </div>
        </form>
      </Form>

      <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">Content Created Successfully!</AlertDialogTitle>
            <AlertDialogDescription>
              Your multimedia entry has been saved. The public link has been copied to your clipboard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 bg-muted p-3 rounded-md border border-border">
            <pre className="text-sm text-foreground truncate flex-1 font-mono">{baseUrl}{newId}</pre>
            <Button variant="ghost" size="icon" onClick={() => copyToClipboard(`${baseUrl}${newId}`)}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <AlertDialogFooter className="mt-4 sm:justify-between gap-2">
            <Button variant="default" onClick={openQrGenerator} className="gap-2">
              <QrCode className="h-4 w-4" />
              Open in QR Art Studio
            </Button>
            <AlertDialogAction onClick={() => setShowSuccessDialog(false)}>Done</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Popup loading overlay */}
      <LoadingOverlay
        open={isLoading}
        title={uploadProgress !== null && uploadProgress < 100 ? "Uploading File…" : "Saving Content…"}
        description={uploadStatus}
        progress={uploadProgress}
      />
    </>
  );
}
