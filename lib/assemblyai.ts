import { AssemblyAI } from "assemblyai";

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

function msToTime(ms: number) {
  const seconds = ms / 1000;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}

export const processMeeting = async (meetingUrl: string) => {
  // Ask for richer signals to enable issue detection
  const transcript = await client.transcripts.transcribe({
    audio: meetingUrl,
    auto_chapters: true,
    auto_highlights: true,
    iab_categories: true,
    sentiment_analysis: true,
    entity_detection: true,
    format_text: true,
  });

  if (!transcript.text) throw new Error("No transcript found");

  // Pull sentences with timestamps for finer-grained analysis
  const sentencesRes = await client.transcripts.sentences(transcript.id);
  const sentences = sentencesRes.sentences || [];

  // Build quick lookup for negative sentiment spans
  const negatives = new Set<string>();
  const sentiments = (transcript as any).sentiment_analysis_results as
    | Array<{ start: number; end: number; sentiment: string; text: string }>
    | undefined;
  if (Array.isArray(sentiments)) {
    for (const s of sentiments) {
      if ((s.sentiment || "").toUpperCase() === "NEGATIVE") {
        negatives.add(`${s.start}-${s.end}`);
      }
    }
  }

  // Collect highlights for salience signals
  const highlights: Array<{
    text: string;
    timestamps: Array<{ start: number; end: number }>;
    rank?: number;
  }> = ((transcript as any).auto_highlights_result?.results as any[]) || [];

  const containsKeyword = (t: string) => {
    const lower = t.toLowerCase();
    return (
      /(\bbug\b|\berror\b|\bissue\b|\bfail(?:ed|ing)?\b|\bnot working\b|\bcrash(?:ed|ing)?\b|\bbroken\b|\bblock(?:er|ed)?\b|\bdelay(?:ed)?\b|\brisk\b|\bconcern\b|\bproblem\b|\bstuck\b|\bmissing\b|\bcan(?:'t|not)\b|\bwon't\b|\burgent\b|\bfix\b)/.test(
        lower,
      )
    );
  };

  // Score each sentence as a potential "issue" mention
  type Candidate = { start: number; end: number; text: string; score: number };
  const candidates: Candidate[] = sentences.map((s) => {
    const key = `${s.start}-${s.end}`;
    const hasNeg = negatives.has(key);
    const hasKeyword = containsKeyword(s.text || "");

    let hasHighlight = false;
    for (const h of highlights) {
      if (h.timestamps?.some((ts) => ts.start >= s.start && ts.end <= s.end)) {
        hasHighlight = true;
        break;
      }
    }

    const score = (hasNeg ? 2 : 0) + (hasKeyword ? 3 : 0) + (hasHighlight ? 1 : 0);
    return { start: s.start, end: s.end, text: s.text, score };
  });

  // Keep sentences likely to describe issues
  const flagged = candidates.filter((c) => c.score >= 2);

  // If nothing was flagged, fallback to chapters (often 1 for short clips)
  if (flagged.length === 0 && transcript.chapters?.length) {
    const summaries = transcript.chapters.map((chapter) => ({
      start: msToTime(chapter.start),
      end: msToTime(chapter.end),
      gist: chapter.gist,
      headline: chapter.headline,
      summary: chapter.summary,
    }));
    return { summaries };
  }

  // Otherwise, merge nearby flagged sentences into coherent spans
  flagged.sort((a, b) => a.start - b.start);
  const groups: Candidate[] = [];
  for (const f of flagged) {
    const last = groups[groups.length - 1];
    if (last && f.start - last.end <= 3000) {
      last.end = Math.max(last.end, f.end);
      last.text = `${last.text} ${f.text}`.trim();
      last.score += f.score;
    } else {
      groups.push({ ...f });
    }
  }

  // Helper to pick a short "headline" string
  const toHeadline = (t: string) => {
    const clean = t.replace(/\s+/g, " ").trim();
    // Prefer a phrase with keywords if present
    const kwMatch = clean
      .split(/([.!?])\s+/)
      .filter((s) => s && containsKeyword(s))[0];
    const base = kwMatch || clean;
    return base.length > 80 ? base.slice(0, 77) + "..." : base;
  };

  const summaries = groups.slice(0, 10).map((g) => {
    const start = msToTime(g.start);
    const end = msToTime(g.end);
    const headline = toHeadline(g.text);
    const gist = headline; // 1-liner gist
    const summary = g.text.length > 500 ? g.text.slice(0, 497) + "..." : g.text;
    return { start, end, headline, gist, summary };
  });

  // As a final fallback, produce one record from first 2 sentences
  if (summaries.length === 0 && sentences.length > 0) {
    const s0 = sentences[0];
    const s1 = sentences[1];
    const start = msToTime(s0.start);
    const end = msToTime((s1?.end ?? s0.end));
    const text = [s0.text, s1?.text].filter(Boolean).join(" ");
    summaries.push({
      start,
      end,
      headline: toHeadline(text),
      gist: toHeadline(text),
      summary: text,
    });
  }

  return { summaries };
};
