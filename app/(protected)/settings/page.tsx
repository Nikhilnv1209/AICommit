"use client";

import {
  getAIConfig,
  saveAIConfigSection,
  testAIConfigSection,
  deleteAIConfigSection,
  type AIConfigView,
  type ProviderConfigView,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye, EyeOff, Loader2, KeyRound, Server, Cpu, Boxes,
  CheckCircle2, AlertTriangle, MessageSquare, Boxes as EmbedIcon, Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type Purpose = "CHAT" | "EMBEDDING";

const EMPTY: AIConfigView = {
  chat: { baseUrl: "https://api.openai.com/v1", model: "", hasApiKey: false, source: "none" },
  embedding: { baseUrl: "https://api.openai.com/v1", model: "", hasApiKey: false, source: "none" },
  encryptionEnabled: true,
};

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["aiConfig"],
    queryFn: async () => await getAIConfig(),
  });

  const config = data?.config ?? EMPTY;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <h1 className="font-mono text-2xl font-medium tracking-tight">settings</h1>
        {config.encryptionEnabled ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
            <CheckCircle2 className="size-3 text-emerald-500" /> encryption enabled
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-amber-500">
            <AlertTriangle className="size-3" /> encryption key missing
          </span>
        )}
      </div>

      <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        Configure any OpenAI-compatible endpoint (OpenAI, Groq, OpenRouter, Together, LM Studio, Ollama, etc.).
        Chat and embeddings use separate configs, so you can mix providers — e.g. OpenAI for chat and a local
        Ollama for embeddings. Keys are AES-256-GCM encrypted at rest and never sent back after saving.
        Embeddings <span className="text-foreground">must return 1024 dimensions</span> to match the database vector column.
      </p>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <ProviderSection
          purpose="CHAT"
          title="chat"
          subtitle="// Q&A · commit & code summaries · streaming"
          icon={<MessageSquare className="size-4" />}
          modelLabel="Chat Model"
          modelHint="E.g. gpt-4o-mini, deepseek-chat, llama-3.1-70b-instruct."
          modelPlaceholder="gpt-4o-mini"
          stored={config.chat}
          isLoading={isLoading}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["aiConfig"] })}
          onDeleted={() => queryClient.invalidateQueries({ queryKey: ["aiConfig"] })}
        />
        <ProviderSection
          purpose="EMBEDDING"
          title="embeddings"
          subtitle="// semantic search indexing"
          icon={<EmbedIcon className="size-4" />}
          modelLabel="Embedding Model"
          modelHint="Must support a 1024-dimensional output. E.g. text-embedding-3-small (with dimensions=1024)."
          modelPlaceholder="text-embedding-3-small"
          stored={config.embedding}
          isLoading={isLoading}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ["aiConfig"] })}
          onDeleted={() => queryClient.invalidateQueries({ queryKey: ["aiConfig"] })}
        />
      </div>

      {!config.encryptionEnabled && (
        <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="font-mono text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">
            <strong>Server setup required:</strong> set <code>AI_CONFIG_ENCRYPTION_KEY</code> in the environment
            (generate with <code>openssl rand -hex 32</code>) and restart. API keys cannot be saved until the
            encryption key is present.
          </p>
        </div>
      )}
    </div>
  );
};

function ProviderSection({
  purpose,
  title,
  subtitle,
  icon,
  modelLabel,
  modelHint,
  modelPlaceholder,
  stored,
  isLoading,
  onSaved,
  onDeleted,
}: {
  purpose: Purpose;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  modelLabel: string;
  modelHint: string;
  modelPlaceholder: string;
  stored: ProviderConfigView;
  isLoading: boolean;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [showKey, setShowKey] = useState(false);

  // Sync server state → local inputs whenever the `stored` object reference
  // changes (initial load, refetch after save/delete). Tracking the reference
  // avoids the latched-on-empty bug a boolean "hydrated" flag would cause.
  const lastSyncedRef = useRef<ProviderConfigView | null>(null);
  useEffect(() => {
    if (stored && stored !== lastSyncedRef.current) {
      setBaseUrl(stored.baseUrl);
      setModel(stored.model);
      setApiKey(""); // never echo a key back into the form
      lastSyncedRef.current = stored;
    }
  }, [stored]);

  const configured = stored.hasApiKey && !!stored.model;

  // Status badge reflecting where the effective config resolves from.
  //   user   → user has their own keys (free, BYO)
  //   server → no user config, will use the hosted fallback (billed via credits)
  //   none   → neither available — feature won't work until something is configured
  const status =
    stored.source === "user" ? { label: "your keys", tone: "text-emerald-500" }
    : stored.source === "server" ? { label: "server default", tone: "text-amber-500" }
    : { label: "not configured", tone: "text-muted-foreground" };

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: (input: { baseUrl: string; apiKey: string; model: string }) =>
      saveAIConfigSection({ purpose, ...input }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`${title} configuration saved.`);
        onSaved();
      } else {
        toast.error(res.error || `Could not save ${title} configuration.`);
      }
    },
    onError: (e: any) => toast.error(e?.message || `Could not save ${title} configuration.`),
  });

  const { mutateAsync: test, isPending: isTesting } = useMutation({
    mutationFn: (input: { baseUrl: string; apiKey: string; model: string }) =>
      testAIConfigSection({ purpose, ...input }),
  });

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: () => deleteAIConfigSection({ purpose }),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`${title} configuration deleted.`);
        onDeleted();
      } else {
        toast.error(res.error || `Could not delete ${title} configuration.`);
      }
    },
    onError: (e: any) => toast.error(e?.message || `Could not delete ${title} configuration.`),
  });

  const handleSave = () => {
    if (!model.trim()) {
      toast.error(`${modelLabel} is required.`);
      return;
    }
    save({ baseUrl, apiKey, model });
  };

  const handleTest = async () => {
    if (!model.trim()) {
      toast.error(`${modelLabel} is required to test.`);
      return;
    }
    const t = toast.loading(`Testing ${title} connection…`);
    const res = await test({ baseUrl, apiKey, model });
    toast.dismiss(t);
    if (res.success) {
      toast.success(`${title} connection successful.`);
    } else {
      toast.error(res.error || `${title} connection test failed.`);
    }
  };

  const handleDelete = () => {
    if (!configured) return;
    remove();
  };

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-primary">{icon}</span>
            <span className="font-mono text-sm font-medium lowercase">{title}</span>
            <span className={`flex items-center gap-1 font-mono text-[9px] ${status.tone}`}>
              {stored.source === "user" && <CheckCircle2 className="size-2.5" />}
              {status.label}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
        {stored.source === "user" && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            title={`Delete ${title} configuration`}
            className="text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
        )}
      </div>

      <div className="space-y-4 p-5">
        {/* Base URL */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground">
            <Server className="size-3" /> Base URL
          </label>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="font-mono text-xs"
            disabled={isLoading}
          />
          <p className="font-mono text-[10px] text-muted-foreground">
            OpenAI-compatible endpoint. Use a different one here if this stage runs on another provider.
          </p>
        </div>

        {/* API key */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground">
            <KeyRound className="size-3" /> API Key
          </label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={stored.hasApiKey ? "•••••••••••••••• (stored)" : "sk-..."}
              className="font-mono text-xs pr-10"
              disabled={isLoading}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {stored.source === "user"
              ? "A key is already stored. Leave blank to keep it; type a new one to replace it."
              : stored.source === "server"
                ? "No key stored. Add your own to stop using the server default (and your credits)."
                : "Required to enable this feature."}
          </p>
        </div>

        {/* Model */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 font-mono text-[11px] font-medium text-foreground">
            {purpose === "CHAT" ? <Cpu className="size-3" /> : <Boxes className="size-3" />} {modelLabel}
          </label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={modelPlaceholder}
            className="font-mono text-xs"
            disabled={isLoading}
          />
          <p className="font-mono text-[10px] text-muted-foreground">{modelHint}</p>
        </div>
      </div>

      <div className="mt-auto flex gap-2 border-t border-border px-5 py-3">
        <Button
          variant="outline"
          size="sm"
          onClick={handleTest}
          disabled={isTesting || isLoading}
          className="flex-1 font-mono text-[11px]"
        >
          {isTesting ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : null}
          Test
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || isLoading}
          className="flex-1 font-mono text-[11px]"
        >
          {isSaving ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

export default SettingsPage;
