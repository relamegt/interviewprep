import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function generateId() {
  return Math.random().toString(36).substring(2, 11);
}

export async function extractTextFromPdf(file: File): Promise<string> {
  const pdfJS = await import("pdfjs-dist");
  
  // Use unpkg which is more reliable for specific npm versions
  // Newer versions of pdfjs-dist use .mjs for the worker
  pdfJS.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfJS.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfJS.getDocument({ 
    data: arrayBuffer,
    useWorkerFetch: true, 
    isEvalSupported: false 
  }).promise;
  
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((item: any) => item.str);
    fullText += strings.join(" ") + "\n";
  }
  
  return fullText;
}
