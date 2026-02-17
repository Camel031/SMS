import { useState } from "react";
import { Upload, CheckCircle, AlertCircle, FileText } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import type { BatchImportPreview, BatchImportResult } from "@/types/equipment-template";

type Step = "upload" | "preview" | "done";

export default function BatchImportDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<BatchImportPreview | null>(null);
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const qc = useQueryClient();

  const validateMutation = useMutation({
    mutationFn: async (csvFile: File) => {
      const formData = new FormData();
      formData.append("file", csvFile);
      const { data } = await api.post<BatchImportPreview>(
        "/equipment/batch-import/",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return data;
    },
    onSuccess: (data) => {
      setPreview(data);
      setStep("preview");
    },
    onError: () => toast.error("Failed to validate CSV file"),
  });

  const importMutation = useMutation({
    mutationFn: async (csvFile: File) => {
      const formData = new FormData();
      formData.append("file", csvFile);
      const { data } = await api.post<BatchImportResult>(
        "/equipment/batch-import/?confirm=true",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setStep("done");
      qc.invalidateQueries({ queryKey: ["equipment-items"] });
      qc.invalidateQueries({ queryKey: ["equipment-models"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: () => toast.error("Import failed"),
  });

  const reset = () => {
    setStep("upload");
    setPreview(null);
    setResult(null);
    setFile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    validateMutation.mutate(f);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-3.5 w-3.5 mr-1" />
          Batch Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batch Import Equipment</DialogTitle>
        </DialogHeader>

        {step === "upload" && (
          <UploadStep
            isValidating={validateMutation.isPending}
            onFileChange={handleFileChange}
          />
        )}

        {step === "preview" && preview && (
          <PreviewStep
            preview={preview}
            isImporting={importMutation.isPending}
            onConfirm={() => { if (file) importMutation.mutate(file); }}
            onBack={reset}
          />
        )}

        {step === "done" && result && (
          <DoneStep result={result} onClose={() => { setOpen(false); reset(); }} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Step 1: Upload ─────────────────────────────────────────────────

function UploadStep({
  isValidating,
  onFileChange,
}: {
  isValidating: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-4 py-4">
      <div className="rounded-md border-2 border-dashed border-border p-8 text-center">
        <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
        <p className="text-sm text-muted-foreground mb-3">
          Upload a CSV file with columns: <code className="text-xs">equipment_model_uuid</code>,{" "}
          <code className="text-xs">internal_id</code> (required), and optionally{" "}
          <code className="text-xs">notes</code>
        </p>
        <label className="inline-block">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            onChange={onFileChange}
            disabled={isValidating}
          />
          <Button asChild variant="outline" disabled={isValidating}>
            <span>{isValidating ? "Validating..." : "Choose CSV File"}</span>
          </Button>
        </label>
      </div>
    </div>
  );
}

// ─── Step 2: Preview ────────────────────────────────────────────────

function PreviewStep({
  preview,
  isImporting,
  onConfirm,
  onBack,
}: {
  preview: BatchImportPreview;
  isImporting: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="flex gap-3">
        <Badge variant="success" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          {preview.valid_count} valid
        </Badge>
        {preview.error_count > 0 && (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="h-3 w-3" />
            {preview.error_count} errors
          </Badge>
        )}
      </div>

      {preview.valid_rows.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Valid Items</h3>
          <div className="rounded-md border border-border max-h-48 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Internal ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.valid_rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm">{row.equipment_model_name}</TableCell>
                    <TableCell className="font-mono text-xs">{row.internal_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {preview.errors.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Errors</h3>
          <div className="rounded-md border border-destructive/30 max-h-48 overflow-y-auto divide-y divide-border">
            {preview.errors.map((err, i) => (
              <div key={i} className="p-2 text-sm">
                <span className="text-xs font-mono text-muted-foreground">Row {err.row}: </span>
                {err.errors.map((msg, j) => (
                  <span key={j} className="text-destructive text-xs">{msg}{j < err.errors.length - 1 ? "; " : ""}</span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onBack}>Back</Button>
        <Button
          onClick={onConfirm}
          disabled={preview.valid_count === 0 || preview.error_count > 0 || isImporting}
        >
          {isImporting ? "Importing..." : `Import ${preview.valid_count} Items`}
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Done ───────────────────────────────────────────────────

function DoneStep({
  result,
  onClose,
}: {
  result: BatchImportResult;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4 py-4 text-center">
      <CheckCircle className="h-12 w-12 mx-auto text-green-500" />
      <div>
        <h3 className="text-lg font-semibold">Import Complete</h3>
        <p className="text-sm text-muted-foreground">
          Successfully created {result.created} equipment item{result.created !== 1 ? "s" : ""}.
        </p>
      </div>
      {result.items.length > 0 && (
        <div className="rounded-md border border-border max-h-40 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Internal ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.items.map((item) => (
                <TableRow key={item.uuid}>
                  <TableCell className="text-sm">{item.model_name}</TableCell>
                  <TableCell className="font-mono text-xs">{item.internal_id}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Button onClick={onClose}>Done</Button>
    </div>
  );
}
