"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateForm } from "@/components/CreateForm";
import { EditForm } from "@/components/EditForm";
import QrArtStudio from "@/components/QrArtStudio";
import { ConnectionTestDialog } from "@/components/ConnectionTestDialog";
import { SayWithLogo } from "@/components/SayWithLogo";
import { LockScreen } from "@/components/LockScreen";
import { FilePlus2, Edit, QrCode, Settings, Server, Database, Cloud, HardDrive } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type StorageProvider = "firebase" | "github" | "r2" | "local";

export default function Home() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [storageProvider, setStorageProvider] = useState<StorageProvider>("firebase");
  const [activeTab, setActiveTab] = useState("create");
  const [selectedQrId, setSelectedQrId] = useState("");
  const [selectedQrUrl, setSelectedQrUrl] = useState("");

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("SW registered: ", registration);
          })
          .catch((registrationError) => {
            console.log("SW registration failed: ", registrationError);
          });
      });
    }

    const savedProvider = localStorage.getItem("storageProvider") as StorageProvider;
    if (savedProvider && ["firebase", "github", "r2", "local"].includes(savedProvider)) {
      setStorageProvider(savedProvider);
    }
  }, []);

  const handleProviderChange = (provider: string) => {
    if (provider === "firebase" || provider === "github" || provider === "r2" || provider === "local") {
      const newProvider = provider as StorageProvider;
      setStorageProvider(newProvider);
      localStorage.setItem("storageProvider", newProvider);
    }
  };

  const handleOpenQrForId = (id: string) => {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000/";
    const fullUrl = `${baseUrl}${id}`;
    setSelectedQrId(id);
    setSelectedQrUrl(fullUrl);
    setActiveTab("qr");
  };

  if (!isUnlocked) {
    return <LockScreen onUnlock={() => setIsUnlocked(true)} />;
  }

  const getProviderLabel = () => {
    switch (storageProvider) {
      case "firebase":
        return "Firebase";
      case "r2":
        return "Cloudflare R2";
      case "github":
        return "GitHub";
      case "local":
        return "Local Disk";
      default:
        return "Storage";
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background text-foreground">
      <main className="flex flex-1 w-full max-w-5xl flex-col items-center justify-start p-4 md:p-8">
        <header className="w-full mb-8 text-center relative flex flex-col items-center">
          <div className="w-full flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <SayWithLogo className="h-8 w-auto" />
              <span className="font-bold text-lg hidden sm:inline-block">SayWith Suite</span>
            </div>

            <div className="flex items-center gap-2">
              <ConnectionTestDialog />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 border-border text-foreground">
                    <Settings className="h-4 w-4" />
                    <span className="hidden sm:inline-block">{getProviderLabel()}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel>Storage Provider</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup value={storageProvider} onValueChange={handleProviderChange}>
                    <DropdownMenuRadioItem value="firebase">
                      <Database className="mr-2 h-4 w-4 text-orange-400" />
                      <span>Firebase Storage</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="r2">
                      <Cloud className="mr-2 h-4 w-4 text-sky-400" />
                      <span>Cloudflare R2</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="github">
                      <Server className="mr-2 h-4 w-4 text-emerald-400" />
                      <span>GitHub Storage</span>
                    </DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="local">
                      <HardDrive className="mr-2 h-4 w-4 text-purple-400" />
                      <span>Local Disk Storage</span>
                    </DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <h1 className="font-headline text-3xl md:text-4xl font-bold tracking-tight text-primary">
            Media &amp; QR Studio
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Unified local studio: create, edit, synchronize audio/SRT, and generate artistic QR codes.
          </p>
        </header>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 bg-muted/50 p-1">
            <TabsTrigger value="create" className="gap-2">
              <FilePlus2 className="h-4 w-4" />
              <span>Create New</span>
            </TabsTrigger>
            <TabsTrigger value="edit" className="gap-2">
              <Edit className="h-4 w-4" />
              <span>Edit Existing</span>
            </TabsTrigger>
            <TabsTrigger value="qr" className="gap-2">
              <QrCode className="h-4 w-4 text-primary" />
              <span>QR Art Studio</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-6">
            <CreateForm storageProvider={storageProvider} onOpenQr={handleOpenQrForId} />
          </TabsContent>

          <TabsContent value="edit" className="mt-6">
            <EditForm onOpenQr={handleOpenQrForId} />
          </TabsContent>

          <TabsContent value="qr" className="mt-6">
            <QrArtStudio qrId={selectedQrUrl} id={selectedQrId} />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="w-full text-center p-4 text-sm text-muted-foreground border-t border-border mt-8">
        &copy; {new Date().getFullYear()} SayWith System &bull; Local Standalone Server
      </footer>
    </div>
  );
}
