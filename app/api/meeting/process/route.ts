import { NextResponse } from "next/server";
import { prisma } from "@/prisma/client";
import { processMeeting } from "@/lib/assemblyai";

export async function POST(request: Request) {
  try {
    const { meetingUrl, meetingId, projectId } = await request.json();

    // Validate input
    if (!meetingUrl || !meetingId || !projectId) {
      return NextResponse.json(
        { error: "Missing required fields: meetingUrl, meetingId, or projectId" },
        { status: 400 }
      );
    }

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
        meetingId,
        projectId,
      })),
    });

    // Update meeting status to completed and set name to first headline
    const updatedMeeting = await prisma.meeting.update({
      where: { id: meetingId },
      data: {
        status: "COMPLETED",
        name: summaries.length > 0 ? summaries[0].headline : "Processed Meeting",
      },
    });

    return NextResponse.json({
      success: true,
      issuesCount: issues.count,
      meeting: updatedMeeting,
    });
  } catch (error) {
    console.error("Error processing meeting:", error);
    return NextResponse.json(
      { error: "Failed to process meeting" },
      { status: 500 }
    );
  }
}