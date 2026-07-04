import { Button } from "@/components/ui/button";
import { currentUser } from "@clerk/nextjs/server";
import {
  ArrowRight,
  Activity as ActivityIcon,
  GitCommit,
  Github,
  Mic,
  Search,
  Users,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function Home() {
  const user = await currentUser();

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#08080b] font-sans text-white antialiased">
      {/* Texture: faint dot grid + film grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[length:22px_22px]"
      />
      <div aria-hidden className="bg-grain pointer-events-none fixed inset-0 -z-10 opacity-[0.05] mix-blend-overlay" />
      {/* Top hairline accent */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-[#bef264]/30 to-transparent"
      />

      {/* Header */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[#08080b]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo-light.png" alt="AICommit" width={26} height={26} className="h-[26px] w-[26px]" />
            <span className="font-mono text-[15px] font-medium tracking-tight">
              <span className="text-[#bef264]">›</span> AICommit
            </span>
          </Link>
          <nav className="hidden items-center gap-8 sm:flex">
            <a href="#capabilities" className="font-mono text-xs text-white/50 transition-colors hover:text-white">
              capabilities
            </a>
            <a href="#preview" className="font-mono text-xs text-white/50 transition-colors hover:text-white">
              preview
            </a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/dashboard">
                <Button size="sm" className="bg-[#bef264] text-[#08080b] hover:bg-[#a3e635] hover:text-[#08080b]">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/sign-in">
                  <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/5 hover:text-white">
                    Sign in
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm" className="bg-[#bef264] text-[#08080b] hover:bg-[#a3e635] hover:text-[#08080b]">
                    Get started <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-36 sm:px-8 sm:pt-44 sm:pb-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
          {/* Copy */}
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-4 duration-700">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-[11px] text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-[#bef264]" />
              v1.0 · commit summaries + meeting-to-issue
            </div>
            <h1 className="mt-6 font-mono text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl lg:text-[56px]">
              Stop reading commits.
              <br />
              <span className="text-white/40">Start</span> understanding them.
            </h1>
            <p className="mt-6 max-w-md text-[15px] leading-relaxed text-white/55">
              AICommit indexes your GitHub repositories and turns them into searchable, conversational
              knowledge — across code, commits, and meetings.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={user ? "/dashboard" : "/sign-up"}>
                <Button
                  size="lg"
                  className="group h-11 rounded-md bg-[#bef264] px-6 text-[#08080b] hover:bg-[#a3e635] hover:text-[#08080b]"
                >
                  Start indexing
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <a href="#preview">
                <Button
                  size="lg"
                  variant="ghost"
                  className="h-11 rounded-md px-5 text-white/70 hover:bg-white/5 hover:text-white"
                >
                  See it work
                </Button>
              </a>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-white/35">
              <span>github-native</span>
              <span className="text-white/15">/</span>
              <span>semantic search</span>
              <span className="text-white/15">/</span>
              <span>meeting → issues</span>
              <span className="text-white/15">/</span>
              <span>ai commit summaries</span>
            </div>
          </div>

          {/* Terminal */}
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-4 duration-700 motion-safe:[animation-delay:120ms]">
            <TerminalPanel />
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section id="capabilities" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
        <div className="border-b border-white/10 pb-6">
          <div className="font-mono text-[11px] text-[#bef264]">{"// capabilities"}</div>
          <h2 className="mt-3 max-w-2xl font-mono text-2xl font-medium tracking-tight sm:text-3xl">
            Built for engineers who read code for a living.
          </h2>
        </div>
        <div className="grid gap-x-10 sm:grid-cols-2">
          <FeatureRow
            index="01"
            icon={<Github className="h-4 w-4" />}
            title="Index GitHub repos"
            description="Connect orgs or repos to continuously ingest code, PRs and issues for instant context."
            delay={0}
          />
          <FeatureRow
            index="02"
            icon={<Search className="h-4 w-4" />}
            title="Semantic Q&A"
            description="Ask natural questions across your codebase and docs; get precise, source-linked answers."
            delay={60}
          />
          <FeatureRow
            index="03"
            icon={<Mic className="h-4 w-4" />}
            title="Meetings → issues"
            description="Turn call recordings into actionable tickets with owners, tags and timelines."
            delay={120}
          />
          <FeatureRow
            index="04"
            icon={<GitCommit className="h-4 w-4" />}
            title="AI commit summaries"
            description="Readable, scoped summaries for every commit and PR to speed up reviews."
            delay={180}
          />
          <FeatureRow
            index="05"
            icon={<Users className="h-4 w-4" />}
            title="Team collaboration"
            description="Shared threads, mentions and saved answers keep everyone aligned in one place."
            delay={240}
          />
          <FeatureRow
            index="06"
            icon={<BarChart3 className="h-4 w-4" />}
            title="Code analytics"
            description="Track hotspots, coverage and churn to prioritize work with data."
            delay={300}
          />
        </div>
      </section>

      {/* Preview */}
      <section id="preview" className="relative mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-8 sm:py-28">
        <div className="mb-10 max-w-xl">
          <div className="font-mono text-[11px] text-[#bef264]">{"// inside aicommit"}</div>
          <h2 className="mt-3 font-mono text-2xl font-medium tracking-tight sm:text-3xl">
            One workspace for code, commits and questions.
          </h2>
          <p className="mt-4 text-[15px] text-white/55">
            Every repo you index becomes a queryable surface — browse summarized commits, ask anything,
            and watch your team&apos;s activity stream in real time.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <PreviewPanel />
          <ActivityPanel />
        </div>
      </section>

      {/* CTA */}
      <section className="relative mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] px-8 py-16 text-center sm:px-16 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(600px_300px_at_center,rgba(190,242,100,0.08),transparent_70%)]"
          />
          <h2 className="mx-auto max-w-2xl font-mono text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            The fastest way to understand a codebase you didn&apos;t write.
          </h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] text-white/55">
            Index your first repository in under a minute. No credit card to start.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href={user ? "/dashboard" : "/sign-up"}>
              <Button
                size="lg"
                className="group h-11 rounded-md bg-[#bef264] px-6 text-[#08080b] hover:bg-[#a3e635] hover:text-[#08080b]"
              >
                Get started free
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button
                size="lg"
                variant="ghost"
                className="h-11 rounded-md px-5 text-white/70 hover:bg-white/5 hover:text-white"
              >
                I already have an account
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 sm:flex-row sm:px-8">
          <div className="flex items-center gap-2.5">
            <Image src="/logo-light.png" alt="AICommit" width={22} height={22} className="h-[22px] w-[22px]" />
            <span className="font-mono text-[13px] text-white/70">
              <span className="text-[#bef264]">›</span> AICommit
            </span>
          </div>
          <p className="font-mono text-[11px] text-white/30">
            © {new Date().getFullYear()} AICommit — built for engineers.
          </p>
        </div>
      </footer>
    </main>
  );
}

function TerminalPanel() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0f] shadow-2xl shadow-black/40">
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 font-mono text-[11px] text-white/35">aicommit — zsh — 96×24</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-white/30">
          <span className="h-1.5 w-1.5 rounded-full bg-[#bef264]" /> connected
        </span>
      </div>
      {/* Body */}
      <div className="space-y-2 p-5 font-mono text-[13px] leading-relaxed sm:p-6">
        <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 duration-500">
          <span className="text-[#bef264]">$</span>{" "}
          <span className="text-white">aicommit index ./acme-platform</span>
        </div>
        <div className="motion-safe:animate-in motion-safe:fade-in duration-500 motion-safe:[animation-delay:400ms]">
          <span className="text-[#bef264]">✓</span>{" "}
          <span className="text-white/70">fetched 1,284 commits from main</span>
        </div>
        <div className="motion-safe:animate-in motion-safe:fade-in duration-500 motion-safe:[animation-delay:700ms]">
          <span className="text-[#bef264]">✓</span>{" "}
          <span className="text-white/70">embedded 12,401 files · cohere</span>
        </div>
        <div className="motion-safe:animate-in motion-safe:fade-in duration-500 motion-safe:[animation-delay:1000ms]">
          <span className="text-[#bef264]">✓</span>{" "}
          <span className="text-white/70">summarized 1,284 commit diffs</span>
        </div>
        <div className="motion-safe:animate-in motion-safe:fade-in duration-500 motion-safe:[animation-delay:1300ms]">
          <span className="text-[#bef264]">→</span>{" "}
          <span className="text-[#bef264]">ready in 38s · ask anything</span>
        </div>
        <div className="flex items-center pt-1">
          <span className="text-white/40">$</span>
          <span className="animate-blink ml-2 inline-block h-4 w-[8px] translate-y-[2px] bg-[#bef264]" />
        </div>
      </div>
    </div>
  );
}

function FeatureRow({
  index,
  icon,
  title,
  description,
  delay,
}: {
  index: string;
  icon: ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 border-t border-white/10 py-7 duration-500"
    >
      <div className="flex items-baseline gap-5">
        <span className="font-mono text-xs text-white/25">{index}</span>
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-[#bef264]">{icon}</span>
            <h3 className="text-[15px] font-medium text-white">{title}</h3>
          </div>
          <p className="mt-2 text-[13.5px] leading-relaxed text-white/45">{description}</p>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0f] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 font-mono text-[11px] text-white/35">acme-platform — main</span>
      </div>
      <div className="p-5 sm:p-6">
        <Tabs defaultValue="commits">
          <div className="flex items-center justify-between">
            <TabsList className="h-auto gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1">
              <TabsTrigger
                value="commits"
                className="rounded-[5px] px-3 py-1 font-mono text-xs text-white/50 data-[state=active]:bg-white/[0.07] data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                commits
              </TabsTrigger>
              <TabsTrigger
                value="qa"
                className="rounded-[5px] px-3 py-1 font-mono text-xs text-white/50 data-[state=active]:bg-white/[0.07] data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                q&amp;a
              </TabsTrigger>
              <TabsTrigger
                value="summary"
                className="rounded-[5px] px-3 py-1 font-mono text-xs text-white/50 data-[state=active]:bg-white/[0.07] data-[state=active]:text-white data-[state=active]:shadow-none"
              >
                summary
              </TabsTrigger>
            </TabsList>
            <span className="font-mono text-[10px] text-white/30">main · synced</span>
          </div>

          <TabsContent value="commits" className="mt-4">
            <ul className="space-y-1.5">
              <ListItem tag="a1b2c3d" title="Add meeting-to-issues pipeline" />
              <ListItem tag="d4e5f6a" title="Summarize commit history in sidebar" />
              <ListItem tag="aa11bb2" title="Improve AI Q&A relevance scoring" />
              <ListItem tag="cd33ee4" title="Refactor embeddings store for speed" />
            </ul>
          </TabsContent>

          <TabsContent value="qa" className="mt-4">
            <ul className="space-y-1.5">
              <ListItem tag="Alex" title="How do we index GitHub repos?" />
              <ListItem tag="Priya" title="What's the meeting-to-issue flow?" />
              <ListItem tag="Jin" title="Explain commit summarization logic" />
              <ListItem tag="Mia" title="How is relevance scored in Q&A?" />
            </ul>
          </TabsContent>

          <TabsContent value="summary" className="mt-4">
            <ul className="space-y-1.5">
              <ListItem tag="feat" title="AI-powered repository insights" />
              <ListItem tag="feat" title="Meeting-to-issue conversion" />
              <ListItem tag="imp" title="Concise commit summaries" />
              <ListItem tag="win" title="Faster onboarding for new devs" />
            </ul>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ActivityPanel() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0f] shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div>
          <div className="font-mono text-[11px] text-white/35">{"// activity"}</div>
          <h3 className="mt-1 text-sm font-medium text-white">Team activity</h3>
        </div>
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-white/30">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#bef264]" /> live
        </span>
      </div>
      <div className="p-3">
        <ul className="space-y-0.5">
          <ActivityRow
            icon={<ActivityIcon className="h-3.5 w-3.5" />}
            who="Alex"
            what="indexed repo"
            extra="ai-commit/web"
            when="2m"
          />
          <ActivityRow icon={<GitCommit className="h-3.5 w-3.5" />} who="Priya" what="merged PR" extra="#142" when="12m" />
          <ActivityRow
            icon={<Search className="h-3.5 w-3.5" />}
            who="Jin"
            what="asked"
            extra="how summaries work"
            when="26m"
          />
          <ActivityRow
            icon={<BarChart3 className="h-3.5 w-3.5" />}
            who="Mia"
            what="ran analytics"
            extra="commit coverage"
            when="1h"
          />
        </ul>
      </div>
    </div>
  );
}

function ActivityRow({
  icon,
  who,
  what,
  extra,
  when,
}: {
  icon: ReactNode;
  who: string;
  what: string;
  extra?: string;
  when: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md px-3 py-2.5 transition-colors hover:bg-white/[0.02]">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-[#bef264]">{icon}</span>
        <span className="truncate text-[13px]">
          <span className="text-white">{who}</span> <span className="text-white/40">{what}</span>
          {extra ? <span className="text-white/40"> · {extra}</span> : null}
        </span>
      </div>
      <span className="ml-3 shrink-0 font-mono text-[10px] text-white/30">{when}</span>
    </li>
  );
}

function ListItem({ tag, title }: { tag: string; title: string }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <span className="truncate text-[13px] text-white/70">{title}</span>
      <span className="font-mono text-[10px] text-[#bef264]/80">{tag}</span>
    </li>
  );
}
