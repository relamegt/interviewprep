import * as React from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, X, CheckCircle2, Loader2, Eye, EyeOff } from "lucide-react";
import { cn, extractTextFromPdf } from "../lib/utils";
import { Button } from "./ui/BaseComponents";

interface ResumeUploadProps {
  onTextExtracted: (text: string) => void;
  currentText?: string;
}

export function ResumeUpload({ onTextExtracted, currentText }: ResumeUploadProps) {
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);

  const onDrop = React.useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setIsExtracting(true);

    try {
      let text = "";
      if (file.type === "application/pdf") {
        text = await extractTextFromPdf(file);
      } else if (file.type === "text/plain") {
        text = await file.text();
      } else {
        throw new Error("Unsupported file type. Please upload a PDF or TXT file.");
      }

      if (!text.trim()) {
        throw new Error("Could not extract any text from the file.");
      }

      onTextExtracted(text);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to parse file");
      setFileName(null);
    } finally {
      setIsExtracting(false);
    }
  }, [onTextExtracted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt']
    },
    multiple: false
  });

  const clear = () => {
    setFileName(null);
    onTextExtracted("");
  };

  return (
    <div className="space-y-4">
      {!fileName && !currentText ? (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all cursor-pointer bg-white/50 backdrop-blur-sm hover:bg-white/80",
            isDragActive ? "border-brand-emerald bg-brand-emerald/5 scale-[1.01]" : "border-clean-border",
            error ? "border-red-300 bg-red-50/50" : ""
          )}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
            <Upload className={cn("text-brand-emerald", isDragActive && "animate-bounce")} size={24} />
          </div>
          <p className="text-clean-ink font-medium mb-1">
            {isDragActive ? "Drop your CV here" : "Upload Resume or CV"}
          </p>
          <p className="text-xs text-gray-400 font-mono uppercase tracking-widest">
            PDF, TXT // Max 5MB
          </p>
          {error && (
            <p className="text-xs text-red-500 mt-4 font-medium flex items-center gap-1">
              <X size={12} /> {error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-clean-border rounded-2xl p-4 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                {isExtracting ? (
                  <Loader2 className="animate-spin text-brand-emerald" size={20} />
                ) : (
                  <FileText className="text-brand-emerald" size={20} />
                )}
              </div>
              <div>
                <p className="text-sm font-bold text-clean-ink truncate max-w-[200px]">
                  {fileName || "Resume Content Loaded"}
                </p>
                <p className="text-[10px] text-brand-emerald font-bold uppercase tracking-wider flex items-center gap-1">
                  {isExtracting ? "Analyzing structure..." : <><CheckCircle2 size={10} /> Sync Complete</>}
                </p>
              </div>
            </div>
            <div className="flex gap-1">
              {currentText && !isExtracting && (
                <Button variant="ghost" size="sm" onClick={() => setShowPreview(!showPreview)}>
                  {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clear}>
                <X size={16} />
              </Button>
            </div>
          </div>
          
          {showPreview && currentText && (
            <div className="bg-gray-50 border border-clean-border rounded-xl p-4 text-[11px] font-mono text-gray-500 overflow-y-auto max-h-[200px] whitespace-pre-wrap leading-relaxed animate-in slide-in-from-top-2">
              {currentText}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
