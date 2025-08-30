"use client";

import { useMemo, useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { setTheme, theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  const index = useMemo(() => {
    if (theme === "light") return 0;
    if (theme === "dark") return 1;
    return 2; // system or undefined
  }, [theme]);

  const setByIndex = (i: number) => {
    if (i === 0) setTheme("light");
    else if (i === 1) setTheme("dark");
    else setTheme("system");
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="relative" aria-label="Theme" role="radiogroup">
      {/* Track as 3 equal columns with internal padding; no column gaps */}
      <div className="relative inline-grid grid-cols-3 items-center rounded-lg border border-border bg-muted select-none">
        {/* Sliding thumb sized to a segment; linear translate in 100% steps */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 h-10 w-10 rounded-md bg-background ring-1 ring-border shadow"
          style={{
            transform: `translateX(${index * 100}%)`,
            transition: "transform 300ms linear",
            willChange: "transform"
          }}
        />

        {/* Segments */}
        <button
          type="button"
          role="radio"
          aria-checked={index === 0}
          className={cn(
            "relative z-10 grid h-10 w-10 place-items-center rounded-md",
            index === 0 ? "text-foreground" : "text-muted-foreground"
          )}
          onClick={() => setByIndex(0)}
        >
          <Sun className="size-5" />
          <span className="sr-only">Light</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={index === 1}
          className={cn(
            "relative z-10 grid h-10 w-10 place-items-center rounded-md",
            index === 1 ? "text-foreground" : "text-muted-foreground"
          )}
          onClick={() => setByIndex(1)}
        >
          <Moon className="size-5" />
          <span className="sr-only">Dark</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={index === 2}
          className={cn(
            "relative z-10 grid h-10 w-10 place-items-center rounded-md",
            index === 2 ? "text-foreground" : "text-muted-foreground"
          )}
          onClick={() => setByIndex(2)}
        >
          <Monitor className="size-5" />
          <span className="sr-only">System</span>
        </button>
      </div>
    </div>
  );
}
