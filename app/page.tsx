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
  FolderGit2,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function Home() {
  const user = await currentUser();

  return (
    <main className="relative min-h-screen overflow-x-hidden overflow-y-auto bg-background text-foreground">
      {/* Grid background */}
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[linear-gradient(to_right,#8080801a_1px,transparent_1px),linear-gradient(to_bottom,#8080801a_1px,transparent_1px)] bg-[size:16px_24px]"></div>
      {/* Side radial fills to cover negative space */}
      <div className="pointer-events-none absolute -left-20 top-0 -z-10 h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(650px_380px_at_left,hsl(var(--primary)_/_0.18),transparent_60%)] blur-3xl"></div>
      <div className="pointer-events-none absolute -right-20 bottom-0 -z-10 h-[60vh] w-[50vw] rounded-full bg-[radial-gradient(650px_380px_at_right,hsl(var(--primary)_/_0.14),transparent_60%)] blur-3xl"></div>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-30 px-4 sm:px-6 lg:px-10">
        <div className="w-full">
          <div className="mt-4 motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-top-2 duration-700 flex h-14 items-center justify-between rounded-2xl border bg-card/60 px-3 sm:px-4 shadow-sm ring-1 ring-white/5 backdrop-blur-md">
            <div className="flex items-center">
              <Image
                src="/logo-light.png"
                alt="AICommit Logo"
                width={28}
                height={28}
                className="h-7 w-7"
              />
              <span className="ml-2 bg-gradient-to-r from-primary to-fuchsia-500 bg-clip-text text-base font-semibold tracking-tight text-transparent">AICommit</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {user ? (
                <Link href="/dashboard">
                  <Button size="sm">Dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link href="/sign-in">
                    <Button size="sm" variant="ghost">Sign In</Button>
                  </Link>
                  <Link href="/sign-up">
                    <Button size="sm" className="bg-gradient-to-r from-primary to-fuchsia-500 text-primary-foreground hover:opacity-90">Sign Up</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative flex min-h-[calc(100vh-96px)] w-full flex-col px-4 pt-24 pb-24 sm:px-6 sm:pb-28 lg:px-10 xl:px-12">
        {/* glow accents */}
        <div className="pointer-events-none absolute left-1/2 top-36 -z-10 h-72 w-72 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)_/_0.25),transparent_70%)] blur-3xl sm:top-28 sm:h-80 sm:w-80"></div>
        <div className="pointer-events-none absolute bottom-24 right-10 -z-10 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)_/_0.20),transparent_70%)] blur-3xl sm:h-56 sm:w-56"></div>


        <div className="grid w-full flex-1 grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          {/* Left: headline + cta + features */}
          <div className="w-full max-w-full h-auto lg:h-full overflow-hidden rounded-3xl bg-gradient-to-r from-primary/40 via-fuchsia-500/30 to-sky-400/30 p-[1px] shadow-sm">
            <div className="h-auto lg:h-full rounded-[calc(theme(borderRadius.3xl)-1px)] border bg-card/60 p-6 sm:p-8 max-[400px]:p-4 backdrop-blur-md motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-left-4 duration-700 flex flex-col">
            <div className="mx-auto mb-3 w-fit rounded-full border bg-background/60 px-3 py-1 text-xs text-muted-foreground shadow-sm lg:mx-0">
              New: Commit summaries and meeting-to-issue ✨
            </div>
            <h1 className="text-center lg:text-left text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl break-words">
              <span className="bg-gradient-to-r from-primary via-fuchsia-500 to-sky-400 bg-clip-text text-transparent">
                Unlock the power of your codebase
              </span>
            </h1>
            <p className="mt-3 text-center lg:text-left max-w-none text-sm text-muted-foreground sm:text-base break-words">
              Understand, manage, and collaborate on your software projects with an AI-native toolkit designed for speed and clarity.
            </p>
            <div className="mt-6 flex justify-center lg:justify-start">
              <Link href={user ? "/dashboard" : "/sign-up"}>
                <Button size="lg" className="relative overflow-hidden bg-gradient-to-r from-primary via-fuchsia-500 to-sky-500 text-primary-foreground shadow-sm transition-opacity hover:opacity-90 motion-reduce:transition-none">
                  <span className="relative z-10">Get Started</span>
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </div>
            <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 auto-rows-auto sm:auto-rows-fr items-stretch content-stretch flex-1 min-h-0">
              <FeatureTile
                className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-bottom-2 duration-700 [animation-delay:60ms]"
                icon={<Github className="h-5 w-5" />}
                title="Index GitHub Repos"
                description="Connect orgs or repos to continuously ingest code, PRs and issues for instant context."
              />
              <FeatureTile
                className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-bottom-2 duration-700 [animation-delay:120ms]"
                icon={<Search className="h-5 w-5" />}
                title="Semantic Q&A"
                description="Ask natural questions across your codebase and docs; get precise, linked answers."
              />
              <FeatureTile
                className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-bottom-2 duration-700 [animation-delay:180ms]"
                icon={<Mic className="h-5 w-5" />}
                title="Meetings → Issues"
                description="Turn call recordings into actionable tickets with owners, tags and timelines."
              />
              <FeatureTile
                className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-bottom-2 duration-700 [animation-delay:240ms]"
                icon={<GitCommit className="h-5 w-5" />}
                title="AI Commit Summaries"
                description="Readable, scoped summaries for every commit and PR to speed up reviews."
              />
              <FeatureTile
                className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-bottom-2 duration-700 [animation-delay:300ms]"
                icon={<Users className="h-5 w-5" />}
                title="Team Collaboration"
                description="Shared threads, mentions and saved answers keep everyone aligned in one place."
              />
              <FeatureTile
                className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-bottom-2 duration-700 [animation-delay:360ms]"
                icon={<BarChart3 className="h-5 w-5" />}
                title="Code Analytics"
                description="Track hotspots, test coverage and churn to prioritize work with data."
              />
            </div>
            </div>
          </div>

          {/* Right: live preview */}
          <div className="motion-safe:animate-in motion-safe:fade-in-50 motion-safe:slide-in-from-right-4 duration-700 h-auto lg:h-full min-h-0 w-full max-w-full">
            <div className="grid w-full h-auto lg:h-full lg:grid-rows-2 gap-6">
              <div className="min-h-0 w-full max-w-full overflow-hidden rounded-3xl max-[400px]:rounded-2xl bg-gradient-to-r from-sky-400/30 via-fuchsia-500/30 to-primary/40 p-[1px] shadow-sm">
                <PreviewCard />
              </div>
              <div className="min-h-0 w-full max-w-full overflow-hidden rounded-3xl bg-gradient-to-r from-primary/40 via-fuchsia-500/30 to-sky-400/30 p-[1px] shadow-sm">
                <ActivityCard />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-4 z-20 px-4 sm:px-6 lg:px-8">
        <div className="w-full text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} AICommit. All rights reserved.
        </div>
      </footer>
    </main>
  );
}

function FeatureTile({
  icon,
  title,
  description,
  className,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`w-full h-full rounded-xl border bg-background/60 p-3 sm:p-4 shadow-sm ring-1 ring-white/5 flex items-start gap-3 ${className ?? ""}`}>
      <div className="shrink-0 text-primary mt-0.5">{icon}</div>
      <div className="min-w-0">
        <div className="text-sm sm:text-base font-medium tracking-tight">{title}</div>
        <div className="mt-1 text-xs sm:text-sm text-muted-foreground leading-relaxed break-words">
          {description}
        </div>
      </div>
    </div>
  );
}

function PreviewCard() {
  return (
    <Card className="relative w-full max-w-full h-auto lg:h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] bg-card/60 shadow-sm border backdrop-blur-md max-[400px]:rounded-2xl">
      <CardHeader className="px-6 sm:px-8 max-[400px]:px-4 pt-6 sm:pt-8 max-[400px]:pt-4 pb-3">
        <CardTitle className="text-base">Repository Insight</CardTitle>
        <CardDescription>Commits • Q&A • Summary</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8 max-[400px]:px-4 pb-6 sm:pb-8 max-[400px]:pb-4 lg:h-[calc(100%-84px)]">
        <Tabs defaultValue="commits" className="h-auto lg:h-full">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="flex flex-wrap gap-1 !h-auto p-1 w-full sm:w-auto">
              <TabsTrigger value="commits" className="px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm max-[400px]:px-1.5 max-[400px]:text-[11px]">Commits</TabsTrigger>
              <TabsTrigger value="qa" className="px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm max-[400px]:px-1.5 max-[400px]:text-[11px]">Q&A</TabsTrigger>
              <TabsTrigger value="summary" className="px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm max-[400px]:px-1.5 max-[400px]:text-[11px]">Summary</TabsTrigger>
            </TabsList>
            <div className="text-xs text-muted-foreground">main • synced</div>
          </div>

          <TabsContent value="commits" className="mt-3 lg:h-[calc(100%-42px)] lg:overflow-y-auto">
            <ul className="space-y-2">
              <ListItem tag="a1b2c3d" title="Add meeting-to-issues pipeline" />
              <ListItem tag="d4e5f6a" title="Summarize commit history in sidebar" />
              <ListItem tag="aa11bb2" title="Improve AI Q&A relevance scoring" />
              <ListItem tag="cd33ee4" title="Refactor embeddings store for speed" />
            </ul>
          </TabsContent>

          <TabsContent value="qa" className="mt-3 lg:h-[calc(100%-42px)] lg:overflow-y-auto">
            <ul className="space-y-2">
              <ListItem tag="Alex" title="How do we index GitHub repos?" />
              <ListItem tag="Priya" title="What's the meeting-to-issue flow?" />
              <ListItem tag="Jin" title="Explain commit summarization logic" />
              <ListItem tag="Mia" title="How is relevance scored in Q&A?" />
            </ul>
          </TabsContent>

          <TabsContent value="summary" className="mt-3 lg:h-[calc(100%-42px)] lg:overflow-y-auto">
             <ul className="space-y-2">
              <ListItem tag="Feature" title="AI-powered repository insights" />
              <ListItem tag="Feature" title="Meeting-to-issue conversion" />
              <ListItem tag="Improvement" title="Concise commit summaries" />
              <ListItem tag="Benefit" title="Faster onboarding for new devs" />
            </ul>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function ActivityCard() {
  return (
    <Card className="relative w-full max-w-full h-auto lg:h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] bg-card/60 shadow-sm border backdrop-blur-md">
      <CardHeader className="px-6 sm:px-8 max-[400px]:px-4 pt-6 sm:pt-8 max-[400px]:pt-4 pb-3">
        <CardTitle className="text-base">Team Activity</CardTitle>
        <CardDescription>What your team’s been up to</CardDescription>
      </CardHeader>
      <CardContent className="px-6 sm:px-8 max-[400px]:px-4 pb-6 sm:pb-8 max-[400px]:pb-4 lg:h-[calc(100%-84px)]">
        <ul className="space-y-2 text-sm">
          <ActivityItem icon={<ActivityIcon className="h-3.5 w-3.5 text-primary" />} who="Alex" what="indexed repo" extra="ai-commit/web" when="2m" />
          <ActivityItem icon={<GitCommit className="h-3.5 w-3.5 text-primary" />} who="Priya" what="merged PR" extra="#142" when="12m" />
          <ActivityItem icon={<Search className="h-3.5 w-3.5 text-primary" />} who="Jin" what="asked" extra="how summaries work" when="26m" />
          <ActivityItem icon={<BarChart3 className="h-3.5 w-3.5 text-primary" />} who="Mia" what="ran analytics" extra="commit coverage" when="1h" />
        </ul>
      </CardContent>
    </Card>
  );
}

function ActivityItem({ icon, who, what, extra, when }: { icon: ReactNode; who: string; what: string; extra?: string; when: string }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border bg-card/50 px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span>{icon}</span>
        <span className="truncate">
          <span className="font-medium">{who}</span> <span className="text-muted-foreground">{what}</span>
          {extra ? <span className="text-muted-foreground"> · {extra}</span> : null}
        </span>
      </div>
      <span className="ml-3 shrink-0 text-[10px] text-muted-foreground">{when}</span>
    </li>
  );
}

function ListItem({ tag, title }: { tag: string; title: string }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border bg-card/50 px-3 py-2">
      <span className="truncate text-muted-foreground">{title}</span>
      <span className="ml-3 shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
        {tag}
      </span>
    </li>
  );
}
