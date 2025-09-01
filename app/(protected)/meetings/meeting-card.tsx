"use client";
import { Button } from "@/components/ui/button";
import { Presentation, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { createMeeting } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { toast } from "sonner";

const MeetingCard = ({ onUploadComplete }: { onUploadComplete?: () => Promise<void> }) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Get project context
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
      const done: Promise<{ secure_url: string }> = new Promise((resolve, reject) => {
        // Progress handled by toast only; no inline UI updates
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

      // Show toast around the upload promise and unwrap the result
      const uploadToast = toast.promise(done, {
        loading: "Uploading audio to Cloudinary...",
        success: "Upload complete",
        error: (err) => err?.message || "Upload failed",
      });
      const json = await uploadToast.unwrap();

      // Save meeting info to database
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
          // Call the upload complete callback to refresh the meetings list
          if (onUploadComplete) {
            // Await the parent refresh so loader hides after list updates
            try {
              await onUploadComplete();
            } catch (_) {}
          }

          // Process the meeting with AssemblyAI in the background (fire and forget)
          fetch("/api/meeting/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              meetingUrl: json.secure_url,
              meetingId: result.meeting.id,
              projectId: project.id,
            }),
          }).catch((processError) => {
            console.error("Error processing meeting:", processError);
            // We don't want to stop the upload flow if processing fails
            // The meeting is still uploaded and saved to the database
          });
          toast.message("Processing meeting...", { description: "We’ll populate issues shortly." });

          // Reset to initial state after meetings list refresh (or immediately if no callback)
          setUploading(false);
          if (inputRef.current) inputRef.current.value = "";
        } else {
          setError(result.error || "Failed to save meeting to database");
          setUploading(false);
          toast.error(result.error || "Failed to save meeting to database");
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Upload failed");
      setUploading(false);
      toast.error(err.message || "Upload failed");
    }
  };

  return (
    <div className="h-full w-full">
      <div className="w-full h-full flex items-center justify-center border border-sidebar-border bg-sidebar shadow rounded-lg py-5">
        <div className="flex flex-col items-center gap-3 sm:gap-4 text-center p-4 sm:p-5 w-full">
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
        </div>
      </div>
    </div>
  );
};

export default MeetingCard;
