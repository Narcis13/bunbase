/**
 * File field component for upload, preview, and removal.
 * Supports single and multi-file modes with drag-and-drop.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, X, FileIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAuthenticatedFileUrl } from "@/lib/api";

export interface FileFieldValue {
  existing: string[];
  newFiles: File[];
}

interface FileFieldProps {
  value: FileFieldValue;
  onChange: (value: FileFieldValue) => void;
  maxFiles?: number;
  maxSize?: number;
  allowedTypes?: string[];
  disabled?: boolean;
}

function getFilenameFromUrl(url: string): string {
  try {
    const parts = url.split("/");
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}

function isImageUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/.test(lower);
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

function matchesMimePattern(fileType: string, pattern: string): boolean {
  if (pattern === "*/*") return true;
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1);
    return fileType.startsWith(prefix);
  }
  return fileType === pattern;
}

/**
 * FileField handles file uploads with preview, removal, and validation.
 * Manages both existing server files and new local File objects.
 */
export function FileField({
  value,
  onChange,
  maxFiles = 1,
  maxSize = 5242880,
  allowedTypes = [],
  disabled = false,
}: FileFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Map<File, string>>(new Map());

  const totalFiles = value.existing.length + value.newFiles.length;
  const canAddMore = totalFiles < maxFiles;

  // Create and clean up preview URLs for new files
  useEffect(() => {
    const newMap = new Map<File, string>();
    for (const file of value.newFiles) {
      const existing = previewUrls.get(file);
      if (existing) {
        newMap.set(file, existing);
      } else if (isImageFile(file)) {
        newMap.set(file, URL.createObjectURL(file));
      }
    }
    // Revoke old URLs that are no longer needed
    for (const [file, url] of previewUrls) {
      if (!newMap.has(file)) {
        URL.revokeObjectURL(url);
      }
    }
    setPreviewUrls(newMap);
    return () => {
      for (const url of newMap.values()) {
        URL.revokeObjectURL(url);
      }
    };
    // Only re-run when newFiles array changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.newFiles]);

  const validateAndAddFiles = useCallback(
    (files: File[]) => {
      const remaining = maxFiles - totalFiles;
      if (remaining <= 0) {
        toast.error(`Maximum ${maxFiles} file${maxFiles > 1 ? "s" : ""} allowed`);
        return;
      }

      const validFiles: File[] = [];
      for (const file of files.slice(0, remaining)) {
        if (maxSize && file.size > maxSize) {
          toast.error(
            `"${file.name}" exceeds max size of ${(maxSize / 1024 / 1024).toFixed(1)} MB`
          );
          continue;
        }
        if (allowedTypes.length > 0) {
          const matches = allowedTypes.some((pattern) =>
            matchesMimePattern(file.type, pattern)
          );
          if (!matches) {
            toast.error(
              `"${file.name}" type "${file.type}" is not allowed. Accepted: ${allowedTypes.join(", ")}`
            );
            continue;
          }
        }
        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        onChange({
          ...value,
          newFiles: [...value.newFiles, ...validFiles],
        });
      }
    },
    [maxFiles, maxSize, allowedTypes, totalFiles, value, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const files = Array.from(e.dataTransfer.files);
      validateAndAddFiles(files);
    },
    [disabled, validateAndAddFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      validateAndAddFiles(files);
      // Reset input so selecting the same file again works
      e.target.value = "";
    },
    [validateAndAddFiles]
  );

  const removeExisting = (index: number) => {
    onChange({
      ...value,
      existing: value.existing.filter((_, i) => i !== index),
    });
  };

  const removeNew = (index: number) => {
    onChange({
      ...value,
      newFiles: value.newFiles.filter((_, i) => i !== index),
    });
  };

  const accept = allowedTypes.length > 0 ? allowedTypes.join(",") : undefined;

  return (
    <div className="space-y-3">
      {/* Existing files */}
      {value.existing.map((url, i) => {
        const authUrl = getAuthenticatedFileUrl(url);
        return (
          <div
            key={`existing-${i}`}
            className="flex items-center gap-3 rounded-md border p-2"
          >
            {isImageUrl(url) ? (
              <a href={authUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={authUrl}
                  alt={getFilenameFromUrl(url)}
                  className="h-10 w-10 rounded object-cover"
                />
              </a>
            ) : (
              <a
                href={authUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 w-10 items-center justify-center rounded bg-muted hover:bg-muted/80"
              >
                <FileIcon className="h-5 w-5 text-muted-foreground" />
              </a>
            )}
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 truncate text-sm hover:underline"
            >
              {getFilenameFromUrl(url)}
            </a>
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => removeExisting(i)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}

      {/* New files */}
      {value.newFiles.map((file, i) => (
        <div
          key={`new-${i}`}
          className="flex items-center gap-3 rounded-md border border-dashed p-2"
        >
          {previewUrls.get(file) ? (
            <img
              src={previewUrls.get(file)}
              alt={file.name}
              className="h-10 w-10 rounded object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
              <FileIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <span className="block truncate text-sm">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </span>
          </div>
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => removeNew(i)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}

      {/* Drop zone */}
      {canAddMore && !disabled && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed p-6 transition-colors ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-muted-foreground/50"
          }`}
        >
          <Upload className="mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drop files here or click to browse
          </p>
          {allowedTypes.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Accepted: {allowedTypes.join(", ")}
            </p>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={accept}
            multiple={maxFiles > 1}
            onChange={handleFileInput}
          />
        </div>
      )}
    </div>
  );
}
