"use client";

import { getMeetingById } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ListChecks, Video, ArrowRight } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

// Assuming this is the shape of the issue object
type Issue = {
  id: string;
  createdAt: Date; // Prisma returns Date objects
  headline: string;
  summary: string;
  start: string;
  end: string;
};

const MeetingPage = () => {
  const params = useParams();
  const id = params.id as string;
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  const { data: meetingResponse, status } = useQuery({
    queryKey: ["meeting", id],
    queryFn: async () => {
      return await getMeetingById(id);
    },
    enabled: !!id,
  });

  const meeting = meetingResponse?.success ? meetingResponse.meeting : null;

  const truncateSummary = (summary: string, maxLength = 100) => {
    if (summary.length <= maxLength) {
      return summary;
    }
    return summary.substring(0, maxLength) + "...";
  };

  if (status === "pending") {
    return <div>Loading...</div>;
  }

  if (status === "error" || !meeting) {
    return <div>Error loading meeting.</div>;
  }

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && setSelectedIssue(null)}>
      <div className="w-full p-6 md:p-8 transition-colors">
        <div className="flex items-start gap-4 md:gap-6 mb-8">
          <div className="rounded-xl p-3 md:p-4 bg-primary/10 text-primary ring-1 ring-primary/20 shadow-sm transition-colors">
            <Video size={28} className="md:h-8 md:w-8" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{meeting.name}</h1>
            <div className="flex flex-wrap items-center gap-3 text-muted-foreground mt-2">
              <div className="inline-flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4" />
                <span>{new Date(meeting.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="inline-flex items-center gap-2 text-sm">
                <ListChecks className="h-4 w-4" />
                <span>{meeting.issues?.length ?? 0} issues</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 md:mt-8">
          <h2 className="text-xl md:text-2xl font-semibold mb-4 flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            Issues
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {meeting.issues?.map((issue) => (
              <Card
                key={issue.id}
                className="group relative flex flex-col overflow-hidden bg-card hover:shadow-lg border-0"
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary/40 via-primary to-primary/40 opacity-70" />
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg p-2 bg-primary/10 text-primary ring-1 ring-primary/20">
                      <ListChecks className="h-4 w-4" />
                    </div>
                    <CardTitle className="text-base md:text-lg leading-snug">
                      {issue.headline}
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow pt-0">
                  <p className="text-sm leading-6 text-muted-foreground break-words">
                    {truncateSummary(issue.summary)}
                  </p>
                </CardContent>
                <CardFooter className="pt-2">
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="transition-transform" onClick={() => setSelectedIssue(issue)}>
                      Details
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </Button>
                  </DialogTrigger>
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
      {selectedIssue && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedIssue.headline}</DialogTitle>
            <DialogDescription>
              {new Date(selectedIssue.createdAt).toLocaleDateString()}
            </DialogDescription>
          </DialogHeader>
          <div className="relative pl-6 py-4">
            <div className="absolute left-2.5 top-0 h-full w-0.5 bg-border"></div>
            <div className="relative">
              <div className="pl-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedIssue.start}</span>-<span>{selectedIssue.end}</span>
                </div>
                <p className="mt-2">{selectedIssue.summary}</p>
              </div>
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
};

export default MeetingPage;
