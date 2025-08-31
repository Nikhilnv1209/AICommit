"use client";
import { Button } from "@/components/ui/button";
import { Presentation, Upload } from "lucide-react";
import React, { useRef, useState } from "react";

const MeetingCard = () => {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = () => inputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const isMp3 = file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3");
    if (!isMp3) {
      setUploading(false);
      setProgress(0);
      setUrl(null);
      setFileName("");
      setError("Only MP3 files are supported.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFileName(file.name);
    setUrl(null);
    setProgress(0);
    setUploading(true);

    try {
      // 1) Ask server for a signed payload (no file sent to server)
      const signRes = await fetch("/api/cloudinary/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "meetings", resource_type: "auto" }),
      });
      if (!signRes.ok) throw new Error("Failed to get Cloudinary signature");
      const { timestamp, folder, resource_type, apiKey, cloudName, signature } = await signRes.json();

      // 2) Upload directly to Cloudinary with progress via XHR
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("timestamp", String(timestamp));
      form.append("signature", signature);
      form.append("folder", folder);

      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resource_type}/upload`;

      const xhr = new XMLHttpRequest();
      const done: Promise<any> = new Promise((resolve, reject) => {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
            setProgress(pct);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              resolve(json);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error("Network error during upload"));
      });

      xhr.open("POST", uploadUrl);
      xhr.send(form);
      const json = await done;
      setUrl(json.secure_url as string);
      setProgress(100);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="h-full w-full">
      <div className="w-full h-full flex items-center justify-center border border-sidebar-border bg-sidebar shadow rounded-lg py-5 sm:py-0">
        <div className="flex flex-col items-center gap-3 sm:gap-4 text-center p-4 sm:p-5">
          <Presentation className="animate-bounce text-foreground" size={32} />
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">Create a New Meeting</h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              Analyze your meeting with AICommit — powered by AI.
            </p>
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".mp3,audio/mpeg"
            className="hidden"
            onChange={onFileChange}
          />

          <Button onClick={onPickFile} disabled={uploading} className="w-full sm:w-auto">
            <span className="flex items-center gap-2 px-2 py-1.5 sm:px-4 sm:py-2">
              <Upload className={uploading ? "animate-pulse" : ""} size={18} />
              {uploading ? "Uploading..." : "Upload Meeting"}
            </span>
          </Button>

          {error && (
            <div className="w-full mt-2 text-xs sm:text-sm text-red-500">
              {error}
            </div>
          )}

          {(uploading || progress > 0) && (
            <div className="w-full mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span className="truncate max-w-[70%]" title={fileName}>{fileName || "Preparing..."}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 w-full bg-muted/40 rounded">
                <div
                  className="h-full bg-primary rounded transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {url && (
            <div className="w-full text-xs sm:text-sm mt-3 break-all">
              Uploaded URL: {" "}
              <a className="text-primary underline" href={url} target="_blank" rel="noreferrer">
                {url}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MeetingCard;
