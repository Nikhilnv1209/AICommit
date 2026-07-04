"use client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import useProject from "@/hooks/use-project";
import { cn } from "@/lib/utils";
import { Bot, CreditCard, LayoutDashboard, Plus, Presentation } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getUserCredits } from "@/app/actions";

const items = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Q&A",
    url: "/qa",
    icon: Bot,
  },
  {
    title: "Meetings",
    url: "/meetings",
    icon: Presentation,
  },
  {
    title: "Billing",
    url: "/billing",
    icon: CreditCard,
  },
];

const AppSidebar = () => {
  const pathname = usePathname();
  const { projects, projectId, setProjectId } = useProject();
  const { open } = useSidebar();

  const { data: credits } = useQuery({
    queryKey: ["userCredits"],
    queryFn: async () => {
      const res = await getUserCredits();
      return res.success ? res.credits : null;
    },
  });

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <Image
            src="/logo-dark.png"
            width={32}
            height={32}
            alt="logo"
            className="dark:hidden block"
          />
          <Image
            src="/logo-light.png"
            width={32}
            height={32}
            alt="logo"
            className="hidden dark:block"
          />
          {open && (
            <span className="font-mono text-base font-medium tracking-tight">
              <span className="text-primary">›</span> AICommit
            </span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="font-mono text-[10px] lowercase tracking-wider text-sidebar-foreground/40">
            applications
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link
                        href={item.url}
                        className={cn(
                          pathname === item.url &&
                            "bg-primary/10 text-primary font-medium",
                          "list-none"
                        )}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {open && (
          <SidebarGroup>
            <SidebarGroupLabel className="font-mono text-[10px] lowercase tracking-wider text-sidebar-foreground/40">
              projects
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {projects &&
                  projects.map((project) => {
                    return (
                      <SidebarMenuItem key={project.name}>
                        <SidebarMenuButton asChild>
                          <div
                            className="flex w-full cursor-pointer items-center gap-2"
                            onClick={() => setProjectId(project.id)}
                          >
                            <div
                              className={cn(
                                "flex size-6 shrink-0 items-center justify-center rounded border bg-muted font-mono text-xs text-muted-foreground",
                                project.id === projectId &&
                                  "border-primary/30 bg-primary/10 text-primary"
                              )}
                            >
                              {project.name[0]?.toUpperCase()}
                            </div>
                            <span className="truncate">{project.name}</span>
                          </div>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}

                {/* create project — dashed action, matches upload drop-zone language */}
                <div className="h-2"></div>
                <SidebarMenuItem>
                  <Link
                    href="/create"
                    className="flex items-center justify-center gap-2 rounded-md border border-dashed border-sidebar-border px-3 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.02] hover:text-primary"
                  >
                    <Plus className="size-3.5" />
                    new project
                  </Link>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <Link href="/billing" className="block">
          {open ? (
            <div className="flex items-center justify-between rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2 transition-colors hover:border-primary/30">
              <span className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-primary" /> credits
              </span>
              <span className="font-mono text-xs font-medium tabular-nums text-foreground">
                {credits ?? "—"}
              </span>
            </div>
          ) : (
            <div className="flex justify-center py-1 text-muted-foreground">
              <CreditCard className="size-4" />
            </div>
          )}
        </Link>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSidebar;
