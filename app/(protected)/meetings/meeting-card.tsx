"use client";
import { Loader2, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { createMeeting } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { toast } from "sonner";

const MeetingCard = ({ onUploadComplete }: { onUploadComplete?: () => Promise<void> }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { project } = useProject();

  const onPickFile = () => inputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    const isMp3 = file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3");
    if (!isMp3) {
      setUploading(false);
      setError("Only MP3 files are supported.");
      toast.error("Only MP3 files are supported.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setUploading(true);

    try {
      const signRes = await fetch("/api/cloudinary/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "meetings", resource_type: "auto" }),
      });
      if (!signRes.ok) throw new Error("Failed to get Cloudinary signature");
      const { timestamp, folder, resource_type, apiKey, cloudName, signature } = await signRes.json();

      const form = new FormData();
      form.append("file", file);
      form.append("api_key", apiKey);
      form.append("timestamp", String(timestamp));
      form.append("signature", signature);
      form.append("folder", folder);

      const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/${resource_type}/upload`;

      const xhr = new XMLHttpRequest();
      const done: Promise<{ secure_url: string }> = new Promise((resolve, reject) => {
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

      const uploadToast = toast.promise(done, {
        loading: "Uploading audio to Cloudinary...",
        success: "Upload complete",
        error: (err) => err?.message || "Upload failed",
      });
      const json = await uploadToast.unwrap();

      if (project?.id) {
        const saveToast = toast.promise(
          createMeeting(project.id, file.name, json.secure_url),
          {
            loading: "Saving meeting...",
            success: "Meeting added to your project",
            error: (err) => err?.message || "Failed to save meeting",
          }
        );
        const result = await saveToast.unwrap();
        if (result.success && result.meeting) {
          if (onUploadComplete) {
            try {
              await onUploadComplete();
            } catch (_) {}
          }

          fetch("/api/meeting/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              meetingUrl: json.secure_url,
              meetingId: result.meeting.id,
              projectId: project.id,
            }),
          }).catch(() => {});
          toast.message("Processing meeting...", { description: "We'll populate issues shortly." });

          setUploading(false);
          if (inputRef.current) inputRef.current.value = "";
        } else {
          setError(result.error || "Failed to save meeting to database");
          setUploading(false);
          toast.error(result.error || "Failed to save meeting to database");
        }
      }
    } catch (err: any) {
      setError(err.message || "Upload failed");
      setUploading(false);
      toast.error(err.message || "Upload failed");
    }
  };

  return (
    <div className="h-full w-full">
      <button
        type="button"
        onClick={onPickFile}
        disabled={uploading}
        className="group flex h-full w-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.02] disabled:cursor-wait disabled:opacity-60"
      >
        <div className="flex size-11 items-center justify-center rounded-lg border border-border bg-background transition-colors group-hover:border-primary/30">
          {uploading ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <Upload className="size-5 text-primary" />
          )}
        </div>
        <div>
          <p className="font-mono text-sm font-medium">
            {uploading ? "uploading" : "upload meeting"}
          </p>
          <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
            drop or select an .mp3 to transcribe
          </p>
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,audio/mpeg"
        className="hidden"
        onChange={onFileChange}
      />
      {error && (
        <p className="mt-2 font-mono text-[11px] text-destructive">{error}</p>
      )}
    </div>
  );
};

export default MeetingCard;
