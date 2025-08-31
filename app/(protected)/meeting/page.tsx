"use client";
import { Button } from "@/components/ui/button";
import { Presentation, Upload } from "lucide-react";
import React, { useRef, useState } from "react";
import { readStreamableValue } from "ai/rsc";
import { uploadFileToCloudinary } from "@/app/actions";

const MeetingCard = () => {
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onPickFile = () => inputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setUrl(null);
    setProgress(0);
    setUploading(true);

    try {
      const { progress: stream, result } = await uploadFileToCloudinary(file, {
        folder: "meetings",
        resource_type: "auto",
      });

      for await (const pct of readStreamableValue(stream)) {
        if (typeof pct === "number") setProgress(pct);
      }

      const res = await result;
      setUrl(res.secure_url);
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
            accept="audio/*,video/*,.mp3,.wav,.m4a,.mp4,.mov,.mkv,.webm,.ogg,.aac,.flac,.avi"
            className="hidden"
            onChange={onFileChange}
          />

          <Button onClick={onPickFile} disabled={uploading} className="w-full sm:w-auto">
            <span className="flex items-center gap-2 px-2 py-1.5 sm:px-4 sm:py-2">
              <Upload className={uploading ? "animate-pulse" : ""} size={18} />
              {uploading ? "Uploading..." : "Upload Meeting"}
            </span>
          </Button>

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
