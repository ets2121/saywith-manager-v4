"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { Design, GeneratedQr } from '@/lib/qr-types';
import QRCode from 'qrcode';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';
import { QrCode, Palette, Download, Trash2, Plus, Settings, Loader2, Image as ImageIcon, Upload, Clipboard, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ref as dbRef, get } from 'firebase/database';
import { db } from '@/lib/firebase';

const QR_IMG_SIZE = 512;
const PNG_EXPORT_SIZE = 1024;

const drawCustomQr = (qrData: QRCode.QRCode | null, design: Design, bgImage: string | null, size: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!qrData) return resolve('');
    const canvas = document.createElement('canvas');
    const canvasSize = size;
    canvas.width = canvasSize;
    canvas.height = canvasSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject('Could not get canvas context');

    const modules = qrData.modules.data;
    const moduleCount = qrData.modules.size;
    const padding = design.padding || 0;
    const qrRegionSize = canvasSize - padding * 2;
    const moduleSize = qrRegionSize / moduleCount;

    const drawBackground = () => {
      return new Promise<void>((bgResolve) => {
        ctx.clearRect(0, 0, canvasSize, canvasSize);

        if (design.useImage && bgImage) {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.onload = () => {
            const imgAspectRatio = img.width / img.height;
            const canvasAspectRatio = canvasSize / canvasSize;
            let renderWidth = canvasSize;
            let renderHeight = canvasSize;
            let x = 0;
            let y = 0;

            if (imgAspectRatio > canvasAspectRatio) {
              renderHeight = canvasSize;
              renderWidth = renderHeight * imgAspectRatio;
              x = (canvasSize - renderWidth) / 2;
            } else {
              renderWidth = canvasSize;
              renderHeight = renderWidth / imgAspectRatio;
              y = (canvasSize - renderHeight) / 2;
            }

            const filterParts = [];
            if (design.imageBlur && design.imageBlur > 0) {
              filterParts.push(`blur(${design.imageBlur}px)`);
            }
            const imageFilter = design.imageFilter || 'none';
            if (imageFilter === 'black-and-white') filterParts.push('grayscale(100%)');
            if (imageFilter === 'light') filterParts.push('brightness(150%)');
            if (imageFilter === 'sketchy') {
              filterParts.push('grayscale(100%) contrast(200%) brightness(120%)');
            }
            if (filterParts.length > 0) {
              ctx.filter = filterParts.join(' ');
            }

            ctx.drawImage(img, x, y, renderWidth, renderHeight);
            ctx.filter = 'none';

            if (design.imageOverlayColor) {
              ctx.globalAlpha = design.imageOverlayOpacity || 0.5;
              ctx.fillStyle = design.imageOverlayColor;
              ctx.fillRect(0, 0, canvasSize, canvasSize);
              ctx.globalAlpha = 1.0;
            }

            bgResolve();
          };
          img.onerror = () => {
            ctx.fillStyle = design.backgroundColor || '#FFFFFF';
            ctx.fillRect(0, 0, canvasSize, canvasSize);
            bgResolve();
          };
          img.src = bgImage;
        } else {
          if (design.transparentBg) {
            ctx.clearRect(0, 0, canvasSize, canvasSize);
            bgResolve();
            return;
          }
          if (design.bgGradientStart && design.bgGradientEnd) {
            const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
            gradient.addColorStop(0, design.bgGradientStart);
            gradient.addColorStop(1, design.bgGradientEnd);
            ctx.fillStyle = gradient;
          } else {
            ctx.fillStyle = design.backgroundColor || '#FFFFFF';
          }
          ctx.fillRect(0, 0, canvasSize, canvasSize);
          bgResolve();
        }
      });
    };

    const isFinderPattern = (x: number, y: number, count: number): boolean => {
      if (x < 7 && y < 7) return true;
      if (x >= count - 7 && y < 7) return true;
      if (x < 7 && y >= count - 7) return true;
      return false;
    };

    const drawModule = (x: number, y: number, s: number, style: Design['pixelStyle']) => {
      const top = y * s + padding;
      const left = x * s + padding;
      ctx.beginPath();
      switch (style) {
        case 'circle':
          ctx.arc(left + s / 2, top + s / 2, (s / 2) * 0.9, 0, 2 * Math.PI);
          break;
        case 'diamond':
          ctx.moveTo(left + s / 2, top);
          ctx.lineTo(left + s, top + s / 2);
          ctx.lineTo(left + s / 2, top + s);
          ctx.lineTo(left, top + s / 2);
          ctx.closePath();
          break;
        case 'rounded':
          ctx.roundRect(left, top, s, s, [s * 0.25]);
          break;
        default:
          ctx.rect(left, top, s, s);
          break;
      }
      ctx.fill();
    };

    const drawEye = (cornerX: number, cornerY: number) => {
      const eyeSize = moduleSize * 7;
      const pupilSize = moduleSize * 3;
      const eyeColor = design.pixelColor || '#000000';

      ctx.save();
      ctx.translate(padding + cornerX * moduleSize, padding + cornerY * moduleSize);

      ctx.fillStyle = eyeColor;
      const framePath = new Path2D();
      const frameRadius = (design.eyeRadius || 8) * (moduleSize / 8);
      switch (design.eyeShape) {
        case 'shield':
          framePath.moveTo(eyeSize / 2, 0);
          framePath.lineTo(eyeSize, eyeSize * 0.25);
          framePath.lineTo(eyeSize, eyeSize * 0.75);
          framePath.bezierCurveTo(eyeSize, eyeSize, eyeSize / 2, eyeSize, eyeSize / 2, eyeSize);
          framePath.bezierCurveTo(eyeSize / 2, eyeSize, 0, eyeSize, 0, eyeSize * 0.75);
          framePath.lineTo(0, eyeSize * 0.25);
          framePath.closePath();
          break;
        case 'flower':
          const petalCount = 8;
          const outerRadius = eyeSize / 2;
          const innerRadius = eyeSize / 4;
          for (let i = 0; i < petalCount; i++) {
            const angle = (i / petalCount) * (2 * Math.PI);
            const x1 = eyeSize / 2 + Math.cos(angle) * outerRadius;
            const y1 = eyeSize / 2 + Math.sin(angle) * outerRadius;
            const x2 = eyeSize / 2 + Math.cos(angle + Math.PI / petalCount) * innerRadius;
            const y2 = eyeSize / 2 + Math.sin(angle + Math.PI / petalCount) * innerRadius;
            framePath.quadraticCurveTo(x2, y2, x1, y1);
          }
          framePath.closePath();
          break;
        default:
          framePath.roundRect(0, 0, eyeSize, eyeSize, [frameRadius]);
          break;
      }
      ctx.fill(framePath);

      const pupilBgPath = new Path2D();
      const pupilBgPos = moduleSize;
      const pupilBgSize = eyeSize - moduleSize * 2;
      const pupilBgRadius = (design.eyeRadius || 8) * (moduleSize / 16);
      switch (design.eyeStyle) {
        case 'circle':
          pupilBgPath.arc(eyeSize / 2, eyeSize / 2, pupilBgSize / 2, 0, 2 * Math.PI);
          break;
        default:
          pupilBgPath.roundRect(pupilBgPos, pupilBgPos, pupilBgSize, pupilBgSize, [pupilBgRadius]);
          break;
      }

      ctx.save();
      ctx.clip(pupilBgPath);
      if (design.transparentBg || design.useImage) {
        ctx.clearRect(0, 0, eyeSize, eyeSize);
      } else {
        ctx.fillStyle = design.backgroundColor || '#FFFFFF';
        ctx.fillRect(0, 0, eyeSize, eyeSize);
      }
      ctx.restore();

      ctx.fillStyle = eyeColor;
      const pupilPath = new Path2D();
      const pupilPos = (eyeSize - pupilSize) / 2;
      const pupilRadius = (design.eyeRadius || 8) * (moduleSize / 16);
      switch (design.eyeStyle) {
        case 'circle':
          pupilPath.arc(eyeSize / 2, eyeSize / 2, pupilSize / 2, 0, 2 * Math.PI);
          break;
        default:
          pupilPath.roundRect(pupilPos, pupilPos, pupilSize, pupilSize, [pupilRadius]);
          break;
      }
      ctx.fill(pupilPath);

      ctx.restore();
    };

    const applyCanvasShape = () => {
      if (design.canvasShape === 'circle') {
        ctx.globalCompositeOperation = 'destination-in';
        ctx.beginPath();
        ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    };

    drawBackground().then(() => {
      let pixelFillStyle: string | CanvasGradient = design.pixelColor || '#000000';
      if (design.pixelGradientStart && design.pixelGradientEnd && !design.useImage) {
        const gradient = ctx.createLinearGradient(0, 0, canvasSize, canvasSize);
        gradient.addColorStop(0, design.pixelGradientStart);
        gradient.addColorStop(1, design.pixelGradientEnd);
        pixelFillStyle = gradient;
      }

      for (let y = 0; y < moduleCount; y++) {
        for (let x = 0; x < moduleCount; x++) {
          const index = y * moduleCount + x;
          if (!modules[index] || isFinderPattern(x, y, moduleCount)) continue;
          ctx.fillStyle = pixelFillStyle;
          drawModule(x, y, moduleSize, design.pixelStyle);
        }
      }

      drawEye(0, 0);
      drawEye(moduleCount - 7, 0);
      drawEye(0, moduleCount - 7);

      applyCanvasShape();
      resolve(canvas.toDataURL('image/png'));
    });
  });
};

const DesignPreview = ({ design, backgroundImage }: { design: Design; backgroundImage: string | null }) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const generate = async () => {
      try {
        const qrData = QRCode.create('Live Preview', { errorCorrectionLevel: 'H' });
        const dataUrl = await drawCustomQr(qrData, design, backgroundImage, 200);
        if (isMounted) {
          setQrCodeDataUrl(dataUrl);
        }
      } catch (err) {
        console.error('Preview generation failed:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    const timeoutId = setTimeout(generate, 300);
    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, [design, backgroundImage]);

  return (
    <div className="w-full aspect-square bg-muted/50 rounded-lg flex items-center justify-center p-4">
      {isLoading ? (
        <Loader2 className="animate-spin text-primary" />
      ) : (
        <img src={qrCodeDataUrl} alt="QR Code Preview" className="w-full h-full object-contain" />
      )}
    </div>
  );
};

export default function QrArtStudio({ qrId, id }: { qrId?: string; id?: string }) {
  const [activeId, setActiveId] = useState(id || '');
  const [content, setContent] = useState(qrId || 'http://localhost:3000/');
  const [qrText, setqrText] = useState('');
  const [designs, setDesigns] = useState<Design[]>([]);
  const [svgTemplates, setSvgTemplates] = useState<string[]>([]);
  const [generatedQrs, setGeneratedQrs] = useState<GeneratedQr[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [firebaseImage, setFirebaseImage] = useState<string | null>(null);
  const [isFirebaseImageLoading, setIsFirebaseImageLoading] = useState(false);
  const { toast } = useToast();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [fetchedMediaUrl, setFetchedMediaUrl] = useState<string | null>(null);

  const finalBackgroundImage = backgroundImage || firebaseImage || '/default-background.png';

  useEffect(() => {
    if (qrId) {
      setContent(qrId);
    }
  }, [qrId]);

  useEffect(() => {
    if (id) {
      setActiveId(id);
    }
  }, [id]);

  const loadMediaForId = React.useCallback(
    async (targetId: string) => {
      if (!targetId) return;
      setIsFirebaseImageLoading(true);
      setFetchedMediaUrl(null);
      setFirebaseImage(null);

      const targetRef = dbRef(db, `Saywith/${targetId}`);
      try {
        const snapshot = await get(targetRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          if (data && data.name) {
            setqrText(data.name);
          }
          if (data && data.mediaUrl) {
            setFetchedMediaUrl(data.mediaUrl);
            try {
              const response = await fetch(`/api/proxy-image?url=${encodeURIComponent(data.mediaUrl)}`);
              const result = await response.json();
              if (response.ok && result.dataUri) {
                setFirebaseImage(result.dataUri);
              } else {
                setFirebaseImage(null);
              }
            } catch (proxyErr) {
              console.warn('Proxy image failed, will use default background:', proxyErr);
            }
          } else {
            setFetchedMediaUrl('No mediaUrl found in database.');
          }
        } else {
          setFetchedMediaUrl('No data found for ID: ' + targetId);
        }
      } catch (err: any) {
        console.error('Firebase error fetching data for ID:', err);
        setFetchedMediaUrl(`Error: ${err.message}`);
      } finally {
        setIsFirebaseImageLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeId) {
      loadMediaForId(activeId);
    }
  }, [activeId, loadMediaForId]);

  const fetchTemplates = React.useCallback(() => {
    fetch('/api/templates')
      .then((res) => res.json())
      .then((data: string[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setSvgTemplates(data);
        } else {
          setSvgTemplates(['/templates/1_20250826_163402_0000.svg']);
        }
      })
      .catch((err) => {
        console.error('Error fetching templates:', err);
      });
  }, []);

  useEffect(() => {
    fetch('/designs.json')
      .then((res) => {
        if (!res.ok) throw new Error('Could not find designs.json');
        return res.json();
      })
      .then((data: Design[]) => setDesigns(data))
      .catch((err) => {
        console.warn('Could not load designs.json:', err);
      });

    fetchTemplates();
  }, [fetchTemplates]);

  const handleBackgroundImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBackgroundImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTemplateUpload = async () => {
    if (!templateFile) {
      toast({ variant: 'destructive', title: 'No file selected', description: 'Please choose an SVG file to upload.' });
      return;
    }
    setIsUploading(true);

    const formData = new FormData();
    formData.append('file', templateFile);

    try {
      const response = await fetch('/api/upload-template', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to upload template');
      }

      toast({
        variant: 'success',
        title: 'Success!',
        description: 'Your SVG template has been uploaded locally.',
      });
      setTemplateFile(null);
      fetchTemplates();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Upload Failed',
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const replacePathsInTargetG = (svgContent: string, design: Design) => {
    design.qrtext = qrText;
    const evaluateTemplate = (tpl: string, context: any) => {
      return tpl.replace(/\$\{([^}]+)\}/g, (_, code) => {
        try {
          return Function('design', `"use strict"; return (${code})`)(context);
        } catch (e) {
          console.error('Eval error in design.text:', code, e);
          return '';
        }
      });
    };

    let evaluatedText = evaluateTemplate(design.text || '', design);

    return svgContent.replace(
      /<g([^>]*)((?:\sfill=["']#012101["'])|(?:\sstyle=["']\s*fill:\s*#012101\s*["']))[^>]*>[\s\S]*?<\/g>/gi,
      (gMatch) => {
        let cleanedG = gMatch.replace(/\s*fill=["']#012101["']/gi, '');
        cleanedG = cleanedG.replace(/\s*style=["']\s*fill:\s*#012101\s*["']/gi, '');
        cleanedG = cleanedG.replace(/<path[^>]*>/gi, evaluatedText);
        return cleanedG;
      }
    );
  };

  const handleGenerate = async () => {
    if (!content) {
      toast({ variant: 'destructive', title: 'Error', description: 'Content URL or text cannot be empty.' });
      return;
    }
    if (designs.length === 0) {
      toast({ variant: 'destructive', title: 'No Designs', description: 'Please create or load at least one design before generating.' });
      return;
    }

    setIsLoading(true);
    setGeneratedQrs([]);

    try {
      await new Promise((resolve) => setTimeout(resolve, 50));

      const qrResults: GeneratedQr[] = [];
      const qrData = QRCode.create(content, { errorCorrectionLevel: 'H' });

      for (const design of designs) {
        const qrCodeDataUrl = await drawCustomQr(qrData, design, design.useImage ? finalBackgroundImage : null, QR_IMG_SIZE);
        if (!design.template) continue;

        const templateResponse = await fetch(design.template);
        if (!templateResponse.ok) {
          continue;
        }
        let svgText = await templateResponse.text();

        const imageTagRegex = /<image[^>]*>/g;
        const matches = svgText.match(imageTagRegex);
        const indexToReplace = (design.qrCodeImageTagIndex || 1) - 1;

        if (matches && matches.length > indexToReplace) {
          const originalImageTag = matches[indexToReplace];
          const hrefRegex = /(href|xlink:href)=["'](.*?)["']/;
          const newImageTag = originalImageTag.replace(hrefRegex, `$1="${qrCodeDataUrl}"`);
          svgText = svgText.replace(originalImageTag, newImageTag);
        }

        if (design.text) {
          svgText = replacePathsInTargetG(svgText, design);
        }

        qrResults.push({
          designId: design.id,
          svg: `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`,
        });
      }

      setGeneratedQrs(qrResults);

      if (qrResults.length > 0) {
        toast({
          variant: 'success',
          title: 'Success',
          description: `QR codes generated for ${qrResults.length} design(s).`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Generation Failed',
          description: 'No QR codes were generated. Check your designs and template files.',
        });
      }
    } catch (err: any) {
      console.error(err);
      toast({
        variant: 'destructive',
        title: 'Generation Failed',
        description: err.message || 'An unexpected error occurred during generation.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const svgToPng = (svgDataUrl: string, width: number, height: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas to Blob conversion failed'));
          }
        }, 'image/png');
      };
      img.onerror = () => {
        reject(new Error('Failed to load SVG for conversion.'));
      };
      img.src = svgDataUrl;
    });
  };

  const handleDownloadAll = async () => {
    if (generatedQrs.length === 0) {
      toast({ variant: 'destructive', title: 'Nothing to download' });
      return;
    }
    setIsDownloading(true);
    toast({ title: 'Preparing Download', description: 'Generating high-resolution PNG files...' });
    const zip = new JSZip();

    try {
      for (let i = 0; i < generatedQrs.length; i++) {
        const qr = generatedQrs[i];
        const design = designs.find((d) => d.id === qr.designId);
        const designName = design ? design.name.replace(/[^a-z0-9]/gi, '_').toLowerCase() : `design_${i + 1}`;
        const blob = await svgToPng(qr.svg, PNG_EXPORT_SIZE, PNG_EXPORT_SIZE);
        zip.file(`${designName}.png`, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const filename = qrText ? `${qrText}-SayWithQR-designs.zip` : 'SayWithQR-designs.zip';
      saveAs(zipBlob, filename);
      toast({ variant: 'success', title: 'Download Ready!', description: 'Your ZIP file has been downloaded.' });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Download Failed', description: error.message });
    } finally {
      setIsDownloading(false);
    }
  };

  const addDesign = (isImageDesign: boolean) => {
    const newId = designs.length > 0 ? Math.max(...designs.map((d) => d.id)) + 1 : 1;
    const newDesign: Design = {
      id: newId,
      name: `New ${isImageDesign ? 'Image' : 'Basic'} Design ${newId}`,
      template: svgTemplates[0] || '',
      qrCodeImageTagIndex: 1,
      pixelStyle: 'square',
      pixelColor: '#000000',
      backgroundColor: '#FFFFFF',
      foregroundColor: '#000000',
      eyeShape: 'frame',
      eyeStyle: 'square',
      eyeRadius: 8,
      padding: 16,
      canvasShape: 'square',
      text: '<text style="\nfont-size:32px;\nfont-weight:bold;\nfont-style:normal;\nfont-family:Arial;\nfill:${design.foregroundColor};">\n\n${typeof design.qrtext !== "undefined" ? (design.qrtext ?? "@SayWith") : "@SayWith"}\n</text>',
      useImage: isImageDesign,
      imageFilter: 'none',
      imageBlur: 0,
      imageOverlayColor: '#FFFFFF',
      imageOverlayOpacity: 0.5,
      transparentBg: false,
      pixelGradientStart: '',
      pixelGradientEnd: '',
      bgGradientStart: '',
      bgGradientEnd: '',
    };
    setDesigns([...designs, newDesign]);
  };

  const updateDesign = (id: number, updatedProps: Partial<Design>) => {
    setDesigns(designs.map((d) => (d.id === id ? { ...d, ...updatedProps } : d)));
  };

  const removeDesign = (id: number) => {
    setDesigns(designs.filter((d) => d.id !== id));
  };

  const handleExportPresets = () => {
    const blob = new Blob([JSON.stringify(designs, null, 2)], { type: "application/json" });
    saveAs(blob, "SayWith-QR-Presets.json");
    toast({ variant: "success", title: "Exported", description: "Design presets exported to SayWith-QR-Presets.json" });
  };

  const handleImportPresets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setDesigns(parsed);
          toast({ variant: "success", title: "Presets Imported", description: `Loaded ${parsed.length} design presets.` });
        } else {
          toast({ variant: "destructive", title: "Import Error", description: "File does not contain valid design presets." });
        }
      } catch {
        toast({ variant: "destructive", title: "Import Failed", description: "Invalid JSON format." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const downloadSingleSvg = (svgDataUri: string, filename: string) => {
    const base64Data = svgDataUri.split(",")[1];
    const decoded = atob(base64Data);
    const blob = new Blob([decoded], { type: "image/svg+xml" });
    saveAs(blob, `${filename}.svg`);
    toast({ variant: "success", title: "Downloaded", description: `${filename}.svg saved.` });
  };

  const downloadSinglePng = async (svgDataUri: string, filename: string) => {
    try {
      const blob = await svgToPng(svgDataUri, PNG_EXPORT_SIZE, PNG_EXPORT_SIZE);
      saveAs(blob, `${filename}.png`);
      toast({ variant: "success", title: "Downloaded", description: `${filename}.png saved.` });
    } catch (err: any) {
      toast({ variant: "destructive", title: "Download Failed", description: err.message });
    }
  };

  const handleDownloadAllSvg = async () => {
    if (generatedQrs.length === 0) return;
    const zip = new JSZip();
    generatedQrs.forEach((qr, i) => {
      const design = designs.find((d) => d.id === qr.designId);
      const designName = design ? design.name.replace(/[^a-z0-9]/gi, "_").toLowerCase() : `design_${i + 1}`;
      const base64Data = qr.svg.split(",")[1];
      const decoded = atob(base64Data);
      zip.file(`${designName}.svg`, decoded);
    });
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const filename = qrText ? `${qrText}-SayWithQR-SVGs.zip` : "SayWithQR-SVGs.zip";
    saveAs(zipBlob, filename);
    toast({ variant: "success", title: "Download Ready!", description: "All vector SVG files have been downloaded." });
  };

  const saveDesignsLocally = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(designs),
      });

      if (!response.ok) {
        throw new Error('Failed to save designs');
      }

      toast({ variant: 'success', title: 'Designs Saved', description: 'Your designs have been saved locally.' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: error.message || 'Could not save designs.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderDesignList = (isImageDesigns: boolean) => {
    const filteredDesigns = designs.filter((d) => !!d.useImage === isImageDesigns);

    return (
      <div className="space-y-4">
        <Accordion type="single" collapsible className="w-full">
          {filteredDesigns.map((design) => (
            <AccordionItem value={`item-${design.id}`} key={design.id} className="border-border">
              <AccordionTrigger>
                <div className="flex justify-between items-center w-full pr-4">
                  <Input
                    value={design.name}
                    onChange={(e) => updateDesign(design.id, { name: e.target.value })}
                    className="text-base font-medium border-none focus-visible:ring-1"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </AccordionTrigger>
              <AccordionContent className="p-4 bg-background/50 rounded-md">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="md:col-span-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label>SVG Template</Label>
                        <Select value={design.template} onValueChange={(v) => updateDesign(design.id, { template: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {svgTemplates.map((template) => (
                              <SelectItem key={template} value={template}>
                                {template.split('/').pop()}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Pixel Style</Label>
                        <Select
                          value={design.pixelStyle}
                          onValueChange={(v: Design['pixelStyle']) => updateDesign(design.id, { pixelStyle: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="square">Square</SelectItem>
                            <SelectItem value="rounded">Rounded</SelectItem>
                            <SelectItem value="circle">Circle</SelectItem>
                            <SelectItem value="diamond">Diamond</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`qr-index-${design.id}`}>QR Code Image Tag Index</Label>
                        <Input
                          id={`qr-index-${design.id}`}
                          type="number"
                          min="1"
                          value={design.qrCodeImageTagIndex}
                          onChange={(e) => updateDesign(design.id, { qrCodeImageTagIndex: parseInt(e.target.value, 10) || 1 })}
                        />
                        <p className="text-xs text-muted-foreground mt-1">1 for first image tag, 2 for second, etc.</p>
                      </div>
                    </div>

                    <div className="p-4 border border-border rounded-lg space-y-4">
                      <h4 className="font-semibold text-base">QR Canvas Settings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label>Canvas Shape</Label>
                          <Select
                            value={design.canvasShape}
                            onValueChange={(v: Design['canvasShape']) => updateDesign(design.id, { canvasShape: v })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="square">Square</SelectItem>
                              <SelectItem value="circle">Circle</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>QR Code Padding</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[design.padding]}
                            onValueChange={(v) => updateDesign(design.id, { padding: v[0] })}
                            max={64}
                            step={1}
                          />
                          <span className="text-sm text-muted-foreground w-8">{design.padding}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 border border-border rounded-lg space-y-4">
                      <h4 className="font-semibold text-base">Eye Customization</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <Label>Eye Shape</Label>
                          <Select
                            value={design.eyeShape}
                            onValueChange={(v: Design['eyeShape']) => updateDesign(design.id, { eyeShape: v })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="frame">Frame</SelectItem>
                              <SelectItem value="shield">Shield</SelectItem>
                              <SelectItem value="flower">Flower</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Eye Pupil Style</Label>
                          <Select
                            value={design.eyeStyle}
                            onValueChange={(v: Design['eyeStyle']) => updateDesign(design.id, { eyeStyle: v })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="square">Square</SelectItem>
                              <SelectItem value="circle">Circle</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label>Eye Radius</Label>
                        <div className="flex items-center gap-4">
                          <Slider
                            value={[design.eyeRadius]}
                            onValueChange={(v) => updateDesign(design.id, { eyeRadius: v[0] })}
                            max={30}
                            step={1}
                          />
                          <span className="text-sm text-muted-foreground w-8">{design.eyeRadius}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div>
                        <Label>Pixel Color</Label>
                        <Input
                          type="color"
                          value={design.pixelColor}
                          onChange={(e) => updateDesign(design.id, { pixelColor: e.target.value, pixelGradientStart: '', pixelGradientEnd: '' })}
                          className="p-1 h-10"
                        />
                      </div>
                      <div>
                        <Label>QR Background Color</Label>
                        <Input
                          type="color"
                          value={design.backgroundColor}
                          onChange={(e) => updateDesign(design.id, { backgroundColor: e.target.value, bgGradientStart: '', bgGradientEnd: '' })}
                          className="p-1 h-10"
                          disabled={design.useImage || design.transparentBg}
                        />
                      </div>
                    </div>

                    {design.useImage && (
                      <div className="p-4 border border-border rounded-lg space-y-4">
                        <h4 className="font-semibold text-base">Image Background Settings</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <Label>Image Filter</Label>
                            <Select
                              value={design.imageFilter}
                              onValueChange={(v: Design['imageFilter']) => updateDesign(design.id, { imageFilter: v })}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="light">Light</SelectItem>
                                <SelectItem value="black-and-white">Black &amp; White</SelectItem>
                                <SelectItem value="sketchy">Sketchy</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Overlay Color</Label>
                            <Input
                              type="color"
                              value={design.imageOverlayColor}
                              onChange={(e) => updateDesign(design.id, { imageOverlayColor: e.target.value })}
                              className="p-1 h-10"
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Image Blur (px)</Label>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[design.imageBlur || 0]}
                              onValueChange={(v) => updateDesign(design.id, { imageBlur: v[0] })}
                              max={20}
                              step={1}
                            />
                            <span className="text-sm text-muted-foreground w-8">{design.imageBlur || 0}</span>
                          </div>
                        </div>
                        <div>
                          <Label>Overlay Opacity</Label>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[design.imageOverlayOpacity || 0]}
                              onValueChange={(v) => updateDesign(design.id, { imageOverlayOpacity: v[0] })}
                              max={1}
                              step={0.05}
                            />
                            <span className="text-sm text-muted-foreground w-8">
                              {design.imageOverlayOpacity?.toFixed(2) || 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label>Foreground Color (for text)</Label>
                        <Input
                          type="color"
                          value={design.foregroundColor || '#000000'}
                          onChange={(e) => updateDesign(design.id, { foregroundColor: e.target.value })}
                          className="p-1 h-10"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Embedded Text</Label>
                        <Textarea
                          value={design.text || ''}
                          onChange={(e) => updateDesign(design.id, { text: e.target.value })}
                          placeholder="Enter text to embed in the SVG"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-6">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`use-image-${design.id}`}
                          checked={design.useImage}
                          onCheckedChange={(checked) => updateDesign(design.id, { useImage: checked })}
                        />
                        <Label htmlFor={`use-image-${design.id}`}>Use Image Background</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Switch
                          id={`transparent-bg-${design.id}`}
                          checked={!!design.transparentBg}
                          onCheckedChange={(checked) => updateDesign(design.id, { transparentBg: checked })}
                        />
                        <Label htmlFor={`transparent-bg-${design.id}`}>Transparent Background</Label>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4">
                    <h4 className="font-semibold text-base text-center">Live Preview</h4>
                    <DesignPreview design={design} backgroundImage={finalBackgroundImage} />
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeDesign(design.id)}
                      className="w-full gap-2"
                    >
                      <Trash2 className="h-4 w-4" /> Remove Design
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
        <div className="flex justify-between items-center mt-4">
          <Button onClick={() => addDesign(isImageDesigns)} className="gap-2">
            <Plus className="h-4 w-4" /> Add {isImageDesigns ? 'Image' : 'Basic'} Design
          </Button>
          {filteredDesigns.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No {isImageDesigns ? 'image' : 'basic'} designs yet. Add one to get started!
            </p>
          )}
        </div>
      </div>
    );
  };

  const renderDesignManager = () => (
    <div className="space-y-6">
      <Card className="border-border">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="font-headline flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" /> Design Presets
            </CardTitle>
            <CardDescription>Manage and customize your artistic QR templates.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted/50">
              <TabsTrigger value="basic">Basic QR Designs</TabsTrigger>
              <TabsTrigger value="image">Image Background Designs</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="mt-6">
              {renderDesignList(false)}
            </TabsContent>
            <TabsContent value="image" className="mt-6">
              {renderDesignList(true)}
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <Button onClick={saveDesignsLocally} variant="outline" disabled={isSaving} className="gap-2">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {isSaving ? 'Saving...' : 'Save All Designs Locally'}
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleExportPresets} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Export Presets (.json)
            </Button>

            <Input
              id="import-presets-file"
              type="file"
              accept=".json,application/json"
              onChange={handleImportPresets}
              className="hidden"
            />
            <Button asChild variant="secondary" size="sm" className="gap-1.5 cursor-pointer">
              <label htmlFor="import-presets-file">
                <Upload className="h-3.5 w-3.5" />
                Import Presets (.json)
              </label>
            </Button>
          </div>
        </CardFooter>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Upload New SVG Template
          </CardTitle>
          <CardDescription>Add custom SVG artwork templates to inject QR codes into.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-center gap-4">
          <div className="w-full">
            <Label htmlFor="template-upload">SVG Template File</Label>
            <Input
              id="template-upload"
              type="file"
              accept=".svg,image/svg+xml"
              onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
              className="file:text-foreground mt-1"
            />
          </div>
          <Button
            onClick={handleTemplateUpload}
            disabled={isUploading || !templateFile}
            className="w-full sm:w-auto mt-4 sm:mt-0 self-end gap-2"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="space-y-6 w-full">
      <Tabs defaultValue="content" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-muted/50">
          <TabsTrigger value="content" className="gap-2">
            <QrCode className="h-4 w-4" /> Generator
          </TabsTrigger>
          <TabsTrigger value="designs" className="gap-2">
            <Settings className="h-4 w-4" /> Design Presets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content" className="mt-6">
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="font-headline text-2xl">QR Code Generator</CardTitle>
              <CardDescription>Configure the target URL/Content and optional background artwork.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="content-input">QR Content (URL or Text)</Label>
                  <Input
                    id="content-input"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="e.g., http://localhost:3000/..."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="id-input">Load by Unique ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="id-input"
                      value={activeId}
                      onChange={(e) => setActiveId(e.target.value)}
                      placeholder="e.g. 1a2b3c"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => loadMediaForId(activeId)}
                      disabled={!activeId || isFirebaseImageLoading}
                      title="Load media from Firebase"
                    >
                      {isFirebaseImageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Label>Background Artwork</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      Upload a local image or use the image retrieved from the database.
                    </p>
                    <Input
                      id="bg-image-upload"
                      type="file"
                      accept="image/png, image/jpeg"
                      onChange={handleBackgroundImageUpload}
                      className="hidden"
                    />
                    <Button asChild variant="outline">
                      <label htmlFor="bg-image-upload" className="cursor-pointer gap-2">
                        <ImageIcon className="h-4 w-4" /> Upload Local Image
                      </label>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Active Background:</p>
                    <div className="w-full aspect-video rounded-md border border-border flex items-center justify-center bg-muted/50 overflow-hidden">
                      {isFirebaseImageLoading ? (
                        <Skeleton className="w-full h-full" />
                      ) : (
                        <img src={finalBackgroundImage} alt="Current background" className="w-full h-full object-cover" />
                      )}
                    </div>
                  </div>
                </div>

                {fetchedMediaUrl && (
                  <div className="text-xs text-muted-foreground break-all bg-muted/40 p-2 rounded border border-border mt-2">
                    <strong>Loaded Media:</strong> {fetchedMediaUrl}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={handleGenerate} disabled={isLoading} className="gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating QR Codes...
                  </>
                ) : (
                  <>
                    <QrCode className="h-4 w-4" />
                    Generate QR Codes
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="designs" className="mt-6">
          {renderDesignManager()}
        </TabsContent>
      </Tabs>

      {generatedQrs.length > 0 && (
        <section className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-headline font-bold">Generated Artwork ({generatedQrs.length})</h2>
            <div className="flex items-center gap-2">
              <Button onClick={handleDownloadAllSvg} variant="outline" className="gap-2">
                <Download className="h-4 w-4 text-primary" />
                Download All (.svg ZIP)
              </Button>
              <Button onClick={handleDownloadAll} disabled={isDownloading} className="gap-2">
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download All (.png ZIP)
              </Button>
            </div>
          </div>
          <div ref={previewContainerRef} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {generatedQrs.map((qr) => {
              const design = designs.find((d) => d.id === qr.designId);
              const designName = design ? design.name.replace(/[^a-z0-9]/gi, "_").toLowerCase() : `design_${qr.designId}`;
              return (
                <Card key={qr.designId} className="p-4 flex flex-col items-center border-border bg-card">
                  <img src={qr.svg} alt={design?.name || 'QR Code'} className="w-full h-auto rounded-lg shadow-sm" />
                  <p className="mt-3 font-semibold text-sm">{design?.name}</p>
                  <div className="flex items-center gap-2 mt-3 w-full">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs gap-1"
                      onClick={() => downloadSingleSvg(qr.svg, designName)}
                    >
                      <Download className="h-3 w-3" /> SVG
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1 text-xs gap-1"
                      onClick={() => downloadSinglePng(qr.svg, designName)}
                    >
                      <Download className="h-3 w-3" /> PNG
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

