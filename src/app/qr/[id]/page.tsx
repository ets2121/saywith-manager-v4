import QrArtStudio from "@/components/QrArtStudio";

export default async function QrPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const baseUrl = process.env.NEXT_PUBLIC_QR_BASE_URL || "http://localhost:3000/qr/";
  const fullUrl = `${baseUrl}${resolvedParams.id}`;

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-background text-foreground p-4 md:p-8">
      <main className="w-full max-w-4xl">
        <QrArtStudio qrId={fullUrl} id={resolvedParams.id} />
      </main>
    </div>
  );
}

