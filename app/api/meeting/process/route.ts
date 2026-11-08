import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/prisma/client";
import { processMeeting } from "@/lib/assemblyai";
import { logError } from '@/lib/logger';
import { AUDIT_ACTIONS, recordAudit } from "@/lib/audit";

export async function POST(request: Request) {
  const { userId } = await auth();
  let meetingId: string | undefined;
  let projectId: string | undefined;

  try {
    const body = await request.json();
    const { meetingUrl } = body;
    meetingId = body.meetingId;
    projectId = body.projectId;

    // Validate input
    if (!meetingUrl || !meetingId || !projectId) {
      return NextResponse.json(
        { error: "Missing required fields: meetingUrl, meetingId, or projectId" },
        { status: 400 }
      );
    }

    // Narrowed handles for the closures below.
    const meetingIdValue: string = meetingId;
    const projectIdValue: string = projectId;

    // Process the meeting
    const { summaries } = await processMeeting(meetingUrl);

    // Save issues to database
    const issues = await prisma.issue.createMany({
      data: summaries.map((summary) => ({
        start: summary.start,
        end: summary.end,
        headline: summary.headline,
        summary: summary.summary,
        gist: summary.gist,
        meetingId: meetingIdValue,
        projectId: projectIdValue,
      })),
    });

    // Update meeting status to completed and set name to first headline
    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingIdValue },
      data: {
        status: "COMPLETED",
        name: summaries.length > 0 ? summaries[0].headline : "Processed Meeting",
      },
    });

    recordAudit({
      action: AUDIT_ACTIONS.MEETING_PROCESS,
      actorId: userId,
      projectId,
      target: meetingId,
      source: "api",
      metadata: { issuesCount: issues.count },
    });

    return NextResponse.json({
      success: true,
      issuesCount: issues.count,
      meeting: updatedMeeting,
    });
  } catch (error) {
    logError('ProcessMeeting', 'Error processing meeting:', error);
    recordAudit({
      action: AUDIT_ACTIONS.MEETING_PROCESS,
      status: "failure",
      actorId: userId,
      projectId,
      target: meetingId,
      source: "api",
      error,
    });
    return NextResponse.json(
      { error: "Failed to process meeting" },
      { status: 500 }
    );
  }
}
