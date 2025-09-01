"use client";

import { getMeetings } from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useQuery } from "@tanstack/react-query";
import MeetingCard from "./meeting-card";
import { FileAudio, Loader2 } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

// Skeleton component for a single meeting item
const MeetingSkeleton = () => (
  <div className="flex items-start gap-3 bg-card text-card-foreground rounded-lg p-3 shadow border border-border w-full animate-pulse">
    <div className="rounded-full bg-muted p-2 mt-1">
      <FileAudio className="text-muted-foreground" size={20} />
    </div>
    <div className="flex flex-col text-left flex-grow min-w-0">
      <div className="h-4 w-3/4 bg-muted rounded mb-2"></div>
      <div className="h-3 w-1/2 bg-muted rounded mb-1"></div>
      <div className="h-3 w-1/3 bg-muted rounded"></div>
    </div>
  </div>
);

// Skeleton loader displaying placeholder meeting items
const SkeletonLoader = () => (
  <div className="flex flex-col gap-4">
    {Array.from({ length: 3 }).map((_, index) => (
      <MeetingSkeleton key={index} />
    ))}
  </div>
);

const MeetingPage = () => {
  const { projectId } = useProject();
  const [uploadComplete, setUploadComplete] = useState(false);

  const { data: meetingsResponse, status, refetch } = useQuery({
    queryKey: ["meetings", projectId],
    queryFn: async () => {
      if (!projectId) return null;
      return await getMeetings(projectId);
    },
    enabled: !!projectId,
  });

  // Handle upload completion
  const handleUploadComplete = async () => {
    setUploadComplete(true);
    // Refetch meetings after upload and await completion
    await refetch();
  };

  // Reset upload complete status after a short delay
  useEffect(() => {
    if (uploadComplete) {
      const timer = setTimeout(() => {
        setUploadComplete(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [uploadComplete]);

  const meetings = meetingsResponse?.success ? meetingsResponse.meetings : [];

  return (
    <div className="w-full">
      <div className="h-64">
        <MeetingCard onUploadComplete={handleUploadComplete} />
      </div>
      <div className="h-8"></div>
      <h1 className="text-xl font-semibold mb-4">Meetings</h1>
      <div className="flex flex-col gap-4">
        {status === "pending" ? (
          <SkeletonLoader />
        ) : status === "error" ? (
          <div className="text-red-500">Error loading meetings</div>
        ) : meetings && meetings.length > 0 ? (
          meetings.map((meeting) => (
            <Link
              key={meeting.id}
              href={`/meetings/${meeting.id}`}
              className="w-full text-left"
            >
              <div className="flex items-start gap-3 bg-card text-card-foreground rounded-lg p-3 shadow border border-border w-full hover:bg-accent transition-colors">
                <div className="rounded-full bg-primary/10 p-2 mt-1">
                  <FileAudio className="text-primary" size={20} />
                </div>
                <div className="flex flex-col text-left flex-grow min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center justify-center gap-2 min-w-0">
                      <p className="text-foreground font-medium line-clamp-2">
                        {meeting.name}
                      </p>
                      {meeting.status === "PROCESSING" && (
                        <span className="inline-flex items-center gap-1 text-[10px] md:text-xs px-1.5 py-0.5 rounded-lg border bg-yellow-600/70">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {new Date(meeting.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="text-xs text-muted-foreground">
                      {(meeting.issues?.length ?? 0)} issues
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="text-muted-foreground text-center py-8">
            No meetings found. Upload your first meeting to get started.
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingPage;
