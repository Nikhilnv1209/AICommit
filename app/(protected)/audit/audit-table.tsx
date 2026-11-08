"use client";

import Image from "next/image";
import { AUDIT_ACTION_LABELS, type AuditAction, type AuditLogView } from "@/lib/audit-actions";
import { CheckCircle2, ChevronDown, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const SUMMARY_KEYS = [
  "purpose",
  "model",
  "trigger",
  "commits",
  "credits",
  "issuesCount",
  "repoHost",
  "name",
  "keyReplaced",
];

function summarizeMetadata(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const record = metadata as Record<string, unknown>;

  return SUMMARY_KEYS.filter((key) => record[key] !== undefined).map(
    (key) => `${key}: ${String(record[key])}`
  );
}

function actorLabel(event: AuditLogView): string {
  if (!event.actor) return event.actorId ? "Unknown user" : "System";
  const name = `${event.actor.firstName} ${event.actor.lastName}`.trim();
  return name || "Unknown user";
}

function initials(event: AuditLogView): string {
  if (!event.actor) return event.actorId ? "?" : "S";
  const letters = `${event.actor.firstName?.[0] ?? ""}${event.actor.lastName?.[0] ?? ""}`;
  return letters.toUpperCase() || "?";
}

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(event: AuditLogView) {
  const failed = event.status === "failure";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px]",
        failed ? "bg-red-500/10 text-red-500" : "bg-emerald-500/10 text-emerald-500"
      )}
    >
      {failed ? <XCircle className="size-3" /> : <CheckCircle2 className="size-3" />}
      {failed ? "failed" : "success"}
    </span>
  );
}

interface AuditRowProps {
  event: AuditLogView;
  expanded: boolean;
  showProject: boolean;
  onToggle: () => void;
}

const AuditRow = ({ event, expanded, showProject, onToggle }: AuditRowProps) => {
  const summary = summarizeMetadata(event.metadata);
  const label = AUDIT_ACTION_LABELS[event.action as AuditAction] ?? event.action;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
          {event.actor?.imageUrl ? (
            <Image
              src={event.actor.imageUrl}
              alt=""
              width={24}
              height={24}
              className="size-6 rounded-full object-cover"
            />
          ) : (
            <span className="font-mono text-[10px] text-muted-foreground">{initials(event)}</span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm">{label}</span>
            <span className="font-mono text-[10px] text-muted-foreground">{event.action}</span>
            {event.status !== "success" && statusBadge(event)}
            {event.source === "system" && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                system
              </span>
            )}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span className="text-foreground/80">{actorLabel(event)}</span>
            <span>·</span>
            <span>{formatTime(event.createdAt)}</span>
            {showProject && event.projectName && (
              <>
                <span>·</span>
                <span>{event.projectName}</span>
              </>
            )}
            {event.target && (
              <>
                <span>·</span>
                <span className="truncate">{event.target}</span>
              </>
            )}
            {summary.map((entry) => (
              <span key={entry} className="rounded bg-muted px-1.5 py-0.5">
                {entry}
              </span>
            ))}
          </span>
        </span>

        <ChevronDown
          className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
      </button>

      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 font-mono text-[11px]">
          <dl className="grid gap-1 sm:grid-cols-2">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">when</dt>
              <dd>{new Date(event.createdAt).toLocaleString()}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">source</dt>
              <dd>{event.source}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">event</dt>
              <dd className="truncate">{event.id}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">status</dt>
              <dd>{event.status}</dd>
            </div>
          </dl>

          {event.error && (
            <p className="mt-2 rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-red-500">
              {event.error}
            </p>
          )}

          {event.metadata != null && (
            <pre className="mt-2 max-h-48 overflow-auto rounded border border-border bg-background p-2 text-[10px] leading-relaxed">
              {JSON.stringify(event.metadata, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

interface AuditTableProps {
  events: AuditLogView[];
  expandedId: string | null;
  showProject: boolean;
  onToggle: (id: string) => void;
}

const AuditTable = ({ events, expandedId, showProject, onToggle }: AuditTableProps) => {
  const groups = new Map<string, { label: string; events: AuditLogView[] }>();

  for (const event of events) {
    const date = new Date(event.createdAt);
    const key = date.toDateString();
    const group = groups.get(key) ?? { label: dayLabel(date), events: [] };
    group.events.push(event);
    groups.set(key, group);
  }

  return (
    <div className="space-y-5">
      {[...groups.values()].map((group) => (
        <section key={group.label}>
          <h2 className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h2>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {group.events.map((event) => (
              <AuditRow
                key={event.id}
                event={event}
                expanded={expandedId === event.id}
                showProject={showProject}
                onToggle={() => onToggle(event.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default AuditTable;
