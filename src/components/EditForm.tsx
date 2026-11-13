"use client";

import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ref as dbRef, get, update, remove } from "firebase/database";
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, QrCode, Trash2, Edit3, RefreshCw, HardDrive, Database, Cloud, Server, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { LoadingOverlay } from "./LoadingOverlay";
import { FileUploader } from "./FileUploader";
import { MediaLivePreview } from "./MediaLivePreview";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import templates from '@/lib/templates.json';
import type { StorageProvider } from "@/app/page";
import { SrtAdjuster } from "./SrtAdjuster";

const formSchema = z.object({
  name: z.string().optional(),
  template: z.string().optional(),
  enabled: z.boolean().optional(),
  mute: z.boolean().optional(),
});

type EditFormValues = z.infer<typeof formSchema>;

interface DbData extends EditFormValues {
  id?: string;
  mediaUrl: string;
  audioUrl: string;
  srtContent: string;
  name: string;
  template: string;
  enabled: boolean;
  mute: boolean;
  storageProvider: StorageProvider;
  R2mediaPath?: string;
  R2audioPath?: string;
  R2mediaEXP?: string;
  R2audioEXP?: string;
  createdAt?: string;
  updatedAt?: string;
}

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

export function EditForm({ onOpenQr }: { onOpenQr?: (id: string) => void }) {
  const [id, setId] = useState("");
  const [loadedData, setLoadedData] = useState<DbData | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [srtFile, setSrtFile] = useState<File | null>(null);
  const [srtContent, setSrtContent] = useState("");
  const [manualTemplate, setManualTemplate] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string>("");

  // Directory / Browse state
  const [entriesList, setEntriesList] = useState<{ id: string; data: DbData }[]>([]);
  const [isLoadingDirectory, setIsLoadingDirectory] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [showDirectory, setShowDirectory] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const { toast } = useToast();

  const form = useForm<EditFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", template: "", enabled: false, mute: false },
  });

  const fetchDirectory = useCallback(async () => {
    setIsLoadingDirectory(true);
    try {
      const snapshot = await get(dbRef(db, "Saywith"));
      if (snapshot.exists()) {
        const val = snapshot.val();
        const items = Object.entries(val).map(([k, v]) => ({
          id: k,
          data: v as DbData,
        }));
        // Sort newest first
        items.sort((a, b) => {
          const tA = new Date(a.data.updatedAt || a.data.createdAt || 0).getTime();
          const tB = new Date(b.data.updatedAt || b.data.createdAt || 0).getTime();
          return tB - tA;
        });
        setEntriesList(items);
      } else {
        setEntriesList([]);
      }
    } catch (err: any) {
      console.error("Directory fetch error:", err);
    } finally {
      setIsLoadingDirectory(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectory();
  }, [fetchDirectory]);

  useEffect(() => {
    if (loadedData) {
      form.reset({
        name: loadedData.name || "",
        template: loadedData.template || "",
        enabled: loadedData.enabled || false,
        mute: loadedData.mute || false,
      });
      setSrtContent(loadedData.srtContent || "");
      setManualTemplate(loadedData.template || "");
    } else {
      form.reset({ name: "", template: "", enabled: false, mute: false });
      setSrtContent("");
      setManualTemplate("");
    }
  }, [loadedData, form]);

  const handleIdInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    try {
      if (value.includes('/')) {
        const parts = value.split('/');
        const extractedId = parts.filter(Boolean).pop();
        if (extractedId) {
          setId(extractedId);
          return;
        }
      }
    } catch {}
    setId(value);
  };

  const handleLoadItem = async (targetId: string) => {
    if (!targetId) return;
    setId(targetId);
    setIsFetching(true);
    setLoadedData(null);
    setMediaFile(null);
    setAudioFile(null);
    setSrtFile(null);
    try {
      const snapshot = await get(dbRef(db, `Saywith/${targetId}`));
      if (snapshot.exists()) {
        const data = snapshot.val();
        setLoadedData(data);
        toast({ variant: "success", title: "Entry Loaded", description: `Data for '${data.name || targetId}' ready.` });
      } else {
        toast({ variant: "destructive", title: "Not Found", description: "No data found for this ID." });
      }
    } catch (error: any) {
      toast({ variant: "destructive", title: "Error", description: error.message || "Failed to fetch data." });
    } finally {
      setIsFetching(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await remove(dbRef(db, `Saywith/${itemToDelete}`));
      toast({ variant: "success", title: "Deleted", description: `Entry '${itemToDelete}' removed.` });
      if (id === itemToDelete) {
        setLoadedData(null);
        setId("");
      }
      fetchDirectory();
    } catch (err: any) {
      toast({ variant: "destructive", title: "Delete Failed", description: err.message });
    } finally {
      setItemToDelete(null);
    }
  };

  const onUpdate = async (values: EditFormValues) => {
    if (!id || !loadedData) return;
    setIsUpdating(true);
    setUploadProgress(0);
    setUploadStatus("Preparing updates...");

    try {
      const updates: any = {};
      const dirtyFields = form.formState.dirtyFields;
      const finalTemplate = manualTemplate || values.template;

      if (dirtyFields.name) updates.name = values.name;
      if (finalTemplate !== loadedData.template) updates.template = finalTemplate;
      if (dirtyFields.enabled !== undefined) updates.enabled = values.enabled;
      if (dirtyFields.mute !== undefined) updates.mute = values.mute;

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const currentStorageProvider = loadedData.storageProvider || 'firebase';

      if (currentStorageProvider === 'firebase') {
        if (mediaFile) {
          setUploadStatus("Uploading new media to Firebase...");
          const mediaExtension = getFileExtension(mediaFile.name);
          const fileRef = storageRef(storage, `messages/${id}/media_${timestamp}.${mediaExtension}`);
          const task = uploadBytesResumable(fileRef, mediaFile);
          await new Promise<void>((resolve, reject) => {
            task.on('state_changed',
              (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
              (err) => reject(err),
              async () => {
                updates.mediaUrl = await getDownloadURL(task.snapshot.ref);
                resolve();
              }
            );
          });
        }

        if (audioFile) {
          setUploadStatus("Uploading new audio to Firebase...");
          const audioExtension = getFileExtension(audioFile.name);
          const fileRef = storageRef(storage, `messages/${id}/audio_${timestamp}.${audioExtension}`);
          const task = uploadBytesResumable(fileRef, audioFile);
          await new Promise<void>((resolve, reject) => {
            task.on('state_changed',
              (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
              (err) => reject(err),
              async () => {
                updates.audioUrl = await getDownloadURL(task.snapshot.ref);
                resolve();
              }
            );
          });
        }
      } else {
        let uploadUrl = '/api/storage/local';
        if (currentStorageProvider === 'github') uploadUrl = '/api/storage/github';
        else if (currentStorageProvider === 'r2') uploadUrl = '/api/storage/r2';

        const formData = new FormData();
        formData.append('folder', id);
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
          setUploadStatus(`Uploading updated files to ${currentStorageProvider}...`);
          const responseData = await uploadWithProgress(uploadUrl, formData, (pct) => {
            setUploadProgress(pct);
          });

          if (responseData.file1URL) updates.mediaUrl = responseData.file1URL;
          if (responseData.file2URL) updates.audioUrl = responseData.file2URL;
          if (responseData.R2mediaPath) updates.R2mediaPath = responseData.R2mediaPath;
          if (responseData.R2audioPath) updates.R2audioPath = responseData.R2audioPath;
          if (responseData.R2mediaEXP) updates.R2mediaEXP = responseData.R2mediaEXP;
          if (responseData.R2audioEXP) updates.R2audioEXP = responseData.R2audioEXP;
        }
      }

      let finalSrtContent = srtContent;
      if (srtFile) {
        finalSrtContent = await readFileAsText(srtFile);
      }

      if (finalSrtContent.trim() === "") {
        finalSrtContent = "1\n00:00:00,000 --> 00:00:05,000\nSayWith";
      }

      finalSrtContent = finalSrtContent.replace(/Transcribed by TurboScribe\.ai\. Go Unlimited to remove this message/g, "made by SayWith");
      if (finalSrtContent !== loadedData.srtContent) {
        updates.srtContent = finalSrtContent;
      }

      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date().toISOString();
        setUploadStatus("Updating database record...");
        await update(dbRef(db, `Saywith/${id}`), updates);
        setLoadedData(prev => prev ? { ...prev, ...updates } : null);
        toast({ variant: "success", title: "Updated!", description: "Content has been successfully updated." });
        setMediaFile(null);
        setAudioFile(null);
        setSrtFile(null);
        fetchDirectory();
      } else {
        toast({ title: "No Changes", description: "No changes were made to save." });
      }
    } catch (error: any) {
      console.error("Error updating data:", error);
      toast({ variant: "destructive", title: "Update Failed", description: error.message || "Failed to update content." });
    } finally {
      setIsUpdating(false);
      setUploadProgress(null);
      setUploadStatus("");
    }
  };

  const getProviderIcon = (provider: StorageProvider) => {
    switch (provider) {
      case "r2":
        return <Cloud className="h-3.5 w-3.5 text-sky-400" />;
      case "github":
        return <Server className="h-3.5 w-3.5 text-emerald-400" />;
      case "local":
        return <HardDrive className="h-3.5 w-3.5 text-purple-400" />;
      default:
        return <Database className="h-3.5 w-3.5 text-orange-400" />;
    }
  };

  const filteredEntries = entriesList.filter(item => {
    const term = searchFilter.toLowerCase();
    const name = item.data.name?.toLowerCase() || "";
    const idStr = item.id.toLowerCase();
    return name.includes(term) || idStr.includes(term);
  });

  const isVideo = (mediaFile?.type.startsWith("video/") || loadedData?.mediaUrl.match(/\.(mp4|webm|ogg|mov)/i));

  return (
    <div className="space-y-6">
      {/* Search / Browse Directory Card */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Saved Media Directory</CardTitle>
              <CardDescription>Browse existing entries or search directly by Unique ID.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchDirectory}
                disabled={isLoadingDirectory}
                className="gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingDirectory ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDirectory(!showDirectory)}
                className="gap-1.5"
              >
                {showDirectory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                {showDirectory ? "Hide List" : `Browse (${entriesList.length})`}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Enter 9-digit Unique ID (e.g. 1a2b3c4d5)..."
                value={id}
                onChange={handleIdInputChange}
                className="pl-9"
              />
            </div>
            <Button onClick={() => handleLoadItem(id)} disabled={isFetching || !id} className="gap-2">
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Fetch
            </Button>
          </div>

          {showDirectory && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Filter saved entries by title or ID..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>

              {isLoadingDirectory ? (
                <div className="flex items-center justify-center p-8 text-sm text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Loading entries...
                </div>
              ) : filteredEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {entriesList.length === 0 ? "No entries found in database." : "No entries matched your filter."}
                </p>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {filteredEntries.map(({ id: entryId, data: item }) => (
                    <div
                      key={entryId}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                        id === entryId ? "border-primary bg-primary/10" : "border-border bg-background/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border">
                          {item.mediaUrl?.match(/\.(mp4|webm|ogg)$/i) ? (
                            <span className="text-xs font-bold text-primary">VIDEO</span>
                          ) : item.mediaUrl ? (
                            <img src={item.mediaUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xs font-bold text-muted-foreground">TXT</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">{item.name || "Untitled"}</span>
                            <Badge variant={item.enabled ? "default" : "secondary"} className="text-[10px] px-1.5 py-0 h-4">
                              {item.enabled ? "Active" : "Draft"}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <code className="text-foreground/80 font-mono">{entryId}</code>
                            <span>&bull;</span>
                            <span className="flex items-center gap-1">
                              {getProviderIcon(item.storageProvider)}
                              {item.storageProvider || "firebase"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 pl-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleLoadItem(entryId)}
                          className="h-8 px-2.5 text-xs gap-1"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </Button>

                        {onOpenQr && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenQr(entryId)}
                            className="h-8 px-2 text-xs gap-1"
                            title="Open in QR Art Studio"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setItemToDelete(entryId)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loaded Form */}
      {loadedData && (
        <Card className="border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl">Edit: {loadedData.name || id}</CardTitle>
                <CardDescription>
                  Unique ID: <code className="text-foreground font-mono">{id}</code> &bull; Storage:{" "}
                  <strong>{loadedData.storageProvider || "firebase"}</strong>
                </CardDescription>
              </div>
              {onOpenQr && (
                <Button variant="outline" size="sm" onClick={() => onOpenQr(id)} className="gap-2">
                  <QrCode className="h-4 w-4 text-primary" />
                  Open in QR Studio
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onUpdate)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Content Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter content name" {...field} />
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
                        <FormLabel>Template</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a template" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="max-h-60">
                            {templates.map((template) => (
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
                    <FormLabel>Manual Template Value</FormLabel>
                    <FormControl>
                      <Input
                        value={manualTemplate}
                        onChange={(e) => setManualTemplate(e.target.value)}
                        placeholder="Manual template identifier"
                      />
                    </FormControl>
                  </FormItem>
                </div>

                <div className="space-y-5 border-t border-border pt-4">
                  <h3 className="font-semibold text-sm">Media &amp; Audio Assets</h3>
                  <div className="space-y-2">
                    <FileUploader
                      id="media-file-edit"
                      label="Replace Media File"
                      accept="image/*,video/*"
                      file={mediaFile}
                      onFileSelect={setMediaFile}
                    />
                    <MediaLivePreview
                      file={mediaFile}
                      url={!mediaFile ? loadedData.mediaUrl : null}
                      type="media"
                      onClear={() => setMediaFile(null)}
                    />
                  </div>

                  <div className="space-y-2">
                    <FileUploader
                      id="audio-file-edit"
                      label="Replace Audio File"
                      accept="audio/*"
                      file={audioFile}
                      onFileSelect={setAudioFile}
                    />
                    <MediaLivePreview
                      file={audioFile}
                      url={!audioFile ? loadedData.audioUrl : null}
                      type="audio"
                      onClear={() => setAudioFile(null)}
                    />
                  </div>

                  <div className="space-y-2">
                    <FileUploader
                      id="srt-file-edit"
                      label="Upload New SRT File"
                      accept=".srt,.txt"
                      file={srtFile}
                      onFileSelect={setSrtFile}
                    />
                  </div>
                </div>

                {/* In-Browser SRT Subtitle Adjuster */}
                <div className="border-t border-border pt-4">
                  <SrtAdjuster originalSrt={loadedData.srtContent || ""} currentSrt={srtContent} onSrtChange={setSrtContent} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-border pt-4">
                  <FormField
                    control={form.control}
                    name="enabled"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0 rounded-md border border-border p-4 bg-background/50">
                        <FormControl>
                          <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>Active / Published</FormLabel>
                          <FormDescription>Toggle entry visibility</FormDescription>
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
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel>Mute Video Audio</FormLabel>
                            <FormDescription>Rely on separate audio track</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {/* Inline progress removed — popup overlay used instead */}

                <Button
                  type="submit"
                  disabled={isUpdating}
                  className="w-full bg-accent text-accent-foreground hover:bg-accent/90 gap-2 h-11 text-base"
                >
                  {isUpdating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  {isUpdating ? "Saving Changes..." : "Update Content"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Alert */}
      <AlertDialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete entry <code className="font-mono text-foreground">{itemToDelete}</code>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Popup loading overlay */}
      <LoadingOverlay
        open={isUpdating}
        title={uploadProgress !== null && uploadProgress < 100 ? "Uploading File…" : "Saving Changes…"}
        description={uploadStatus}
        progress={uploadProgress}
      />
    </div>
  );
}
