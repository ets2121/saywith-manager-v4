"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Activity, CheckCircle2, XCircle, AlertCircle, RefreshCw, Server, Database, Cloud, HardDrive } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TestResult {
  service: string;
  name: string;
  status: "connected" | "error" | "warning";
  latencyMs: number;
  message: string;
}

export function ConnectionTestDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [lastTested, setLastTested] = useState<string | null>(null);

  const runTest = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system/test-connections");
      const data = await res.json();
      setResults(data.results || []);
      setLastTested(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error("Test connections error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && results.length === 0) {
      runTest();
    }
  };

  const getServiceIcon = (service: string) => {
    switch (service) {
      case "firebase_rtdb":
        return <Database className="h-5 w-5 text-amber-500" />;
      case "firebase_storage":
        return <Database className="h-5 w-5 text-orange-500" />;
      case "cloudflare_r2":
        return <Cloud className="h-5 w-5 text-sky-400" />;
      case "github_storage":
        return <Server className="h-5 w-5 text-emerald-400" />;
      case "local_storage":
        return <HardDrive className="h-5 w-5 text-purple-400" />;
      default:
        return <Server className="h-5 w-5 text-primary" />;
    }
  };

  const allConnected = results.length > 0 && results.every((r) => r.status === "connected");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-border text-foreground hover:bg-muted">
          <Activity className="h-4 w-4 text-emerald-400" />
          <span>Connection Test</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md sm:max-w-lg bg-card text-card-foreground border-border">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Service Diagnostics
            </DialogTitle>
            {results.length > 0 && (
              <Badge variant={allConnected ? "default" : "destructive"} className={allConnected ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                {allConnected ? "All Systems Operational" : "Service Issue Detected"}
              </Badge>
            )}
          </div>
          <DialogDescription className="text-muted-foreground">
            Test and verify local connections to all configured database and storage services.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 my-2">
          {loading && results.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 space-y-3">
              <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Testing connections to services...</p>
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Click below to start the connection test.</p>
          ) : (
            results.map((r) => (
              <div
                key={r.service}
                className="flex items-start justify-between p-3 rounded-lg border border-border bg-background/50 space-x-3"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="mt-0.5">{getServiceIcon(r.service)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{r.name}</span>
                      <span className="text-xs text-muted-foreground">({r.latencyMs} ms)</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.message}</p>
                  </div>
                </div>

                <div className="shrink-0">
                  {r.status === "connected" ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : r.status === "warning" ? (
                    <AlertCircle className="h-5 w-5 text-amber-400" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {lastTested ? `Last run: ${lastTested}` : "Ready"}
          </span>
          <Button
            onClick={runTest}
            disabled={loading}
            size="sm"
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Testing..." : "Retest All"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

