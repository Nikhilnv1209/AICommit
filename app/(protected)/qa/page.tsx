"use client";

import {
  createConversation,
  getConversations,
  getConversationMessages,
  sendMessage,
  editMessage,
  deleteConversation,
} from "@/app/actions";
import useProject from "@/hooks/use-project";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import MDEditor from "@uiw/react-md-editor";
import { useTheme } from "next-themes";
import { readStreamableValue } from "@ai-sdk/rsc";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Plus, Send, FileCode, ChevronRight, Loader2, Brain, Pencil, Trash2 } from "lucide-react";
import "@/app/markdown-container.css";
import CodeReferences from "../dashboard/code-references";

type Conversation = {
  id: string;
  title: string;
  updatedAt: string | Date;
  _count: { messages: number };
};

type Message = {
  id: string;
  role: string;
  content: string;
  fileReferences: any;
  createdAt: string | Date;
};

const QAPage = () => {
  const { projectId } = useProject();
  const { resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

  const [mounted, setMounted] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [streamingFiles, setStreamingFiles] = useState<any[]>([]);

  useEffect(() => setMounted(true), []);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Fetch conversation list
  const { data: conversationsData } = useQuery({
    queryKey: ["conversations", projectId],
    queryFn: async () => {
      if (!projectId) return { success: false, conversations: [] };
      return await getConversations(projectId);
    },
    enabled: !!projectId,
  });

  const conversations: Conversation[] = conversationsData?.success
    ? conversationsData.conversations
    : [];

  // Fetch messages when active conversation changes
  const { data: messagesData, isLoading: isLoadingMessages } = useQuery({
    queryKey: ["conversation-messages", activeConversationId],
    queryFn: async () => {
      if (!activeConversationId) return { success: false, messages: [], projectId: null };
      return await getConversationMessages(activeConversationId);
    },
    enabled: !!activeConversationId,
  });

  useEffect(() => {
    if (messagesData?.success) {
      setMessages(messagesData.messages);
    }
  }, [messagesData]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages, streamingContent, streamingThinking]);

  // Create new conversation
  const createConvMutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("No project selected");
      return await createConversation(projectId);
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
        setActiveConversationId(data.conversationId!);
        setMessages([]);
        setStreamingContent("");
        inputRef.current?.focus();
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create conversation");
    },
  });

  // Delete conversation
  const handleDeleteConversation = async (conversationId: string) => {
    const res = await deleteConversation(conversationId);
    if (res.success) {
      if (activeConversationId === conversationId) {
        setActiveConversationId(null);
        setMessages([]);
      }
      queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
      toast.success("Conversation deleted");
    } else {
      toast.error("Failed to delete conversation");
    }
  };

  // Send message
  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    if (!projectId) {
      toast.error("Select a project first");
      return;
    }

    // If no active conversation, create one first
    let convId = activeConversationId;
    if (!convId) {
      const createRes = await createConversation(projectId);
      if (!createRes.success) {
        toast.error("Failed to create conversation");
        return;
      }
      convId = createRes.conversationId!;
      setActiveConversationId(convId);
      queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
    }

    const userMessage: Message = {
      id: "temp-" + Date.now(),
      role: "user",
      content: input,
      fileReferences: null,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setStreamingThinking("");
    setStreamingFiles([]);

    try {
      const { output, fileReference } = await sendMessage(convId, currentInput, projectId);
      if (fileReference) setStreamingFiles(fileReference);

      let fullResponse = "";
      for await (const delta of readStreamableValue(output) as any) {
        if (!delta) continue;
        if (delta.type === "thinking") {
          setStreamingThinking((prev) => prev + delta.content);
        } else if (delta.type === "answer") {
          fullResponse += delta.content;
          setStreamingContent((prev) => (prev ? prev + delta.content : delta.content));
        }
      }

      // Add assistant message to local state immediately (no gap)
      setMessages((prev) => [...prev, {
        id: "temp-assistant-" + Date.now(),
        role: "assistant",
        content: fullResponse,
        fileReferences: fileReference && fileReference.length > 0 ? fileReference : null,
        createdAt: new Date().toISOString(),
      }]);

      // Refresh from DB to get the real message with proper ID
      await queryClient.refetchQueries({ queryKey: ["conversation-messages", convId] });
      queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
    } catch (error: any) {
      toast.error(error.message || "Failed to get response");
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setStreamingThinking("");
      setStreamingFiles([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEditMessage = async (messageId: string, newContent: string) => {
    if (!activeConversationId || !projectId) return;

    const editIndex = messages.findIndex((m) => m.id === messageId);
    if (editIndex === -1) return;

    // Truncate messages after the edited one, replace with new user message
    const updatedMessages = messages.slice(0, editIndex);
    updatedMessages.push({
      id: "temp-" + Date.now(),
      role: "user",
      content: newContent,
      fileReferences: null,
      createdAt: new Date().toISOString(),
    });
    setMessages(updatedMessages);

    setIsStreaming(true);
    setStreamingContent("");
    setStreamingThinking("");
    setStreamingFiles([]);

    try {
      const { output, fileReference } = await editMessage(messageId, newContent, activeConversationId, projectId);
      if (fileReference) setStreamingFiles(fileReference);

      let fullResponse = "";
      for await (const delta of readStreamableValue(output) as any) {
        if (!delta) continue;
        if (delta.type === "thinking") {
          setStreamingThinking((prev) => prev + delta.content);
        } else if (delta.type === "answer") {
          fullResponse += delta.content;
          setStreamingContent((prev) => (prev ? prev + delta.content : delta.content));
        }
      }

      // Add assistant message to local state immediately (no gap)
      setMessages((prev) => [...prev, {
        id: "temp-assistant-" + Date.now(),
        role: "assistant",
        content: fullResponse,
        fileReferences: fileReference && fileReference.length > 0 ? fileReference : null,
        createdAt: new Date().toISOString(),
      }]);

      // Refresh from DB to get the real message with proper ID
      await queryClient.refetchQueries({ queryKey: ["conversation-messages", activeConversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations", projectId] });
    } catch (error: any) {
      toast.error(error.message || "Failed to edit message");
    } finally {
      setIsStreaming(false);
      setStreamingContent("");
      setStreamingThinking("");
      setStreamingFiles([]);
    }
  };

  return (
    <div className="flex h-full w-full gap-0 overflow-hidden rounded-xl border border-border bg-card">
      {/* Conversation list */}
      <div className="flex w-56 shrink-0 flex-col border-r border-border bg-background/30">
        <div className="border-b border-border p-3">
          <button
            onClick={() => createConvMutation.mutate()}
            disabled={!mounted || createConvMutation.isPending || !projectId}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.02] hover:text-primary disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            new chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 font-mono text-[10px] text-muted-foreground/50">
              no conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group mb-1 flex w-full items-center gap-1 rounded-md px-3 py-2 text-left transition-colors ${
                  activeConversationId === conv.id
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <button
                  onClick={() => {
                    setActiveConversationId(conv.id);
                    setStreamingContent("");
                    setIsStreaming(false);
                  }}
                  className="flex w-full flex-1 flex-col gap-0.5 overflow-hidden text-left"
                >
                  <span className="truncate text-xs font-medium">{conv.title}</span>
                  <span className="font-mono text-[10px] opacity-60">
                    {conv._count.messages} msgs · {new Date(conv.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteConversation(conv.id);
                  }}
                  className="shrink-0 text-muted-foreground/40 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat thread */}
      <div className="flex flex-1 flex-col">
        {!activeConversationId && messages.length === 0 && !isStreaming ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-background">
              <FileCode className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-mono text-sm font-medium">ask the codebase</p>
              <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
                start a conversation or pick one from the left
              </p>
            </div>
            <button
              onClick={() => createConvMutation.mutate()}
              disabled={!mounted || createConvMutation.isPending || !projectId}
              className="mt-2 flex items-center gap-2 rounded-md bg-primary px-4 py-2 font-mono text-xs text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="size-3.5" />
              start a new chat
            </button>
          </div>
        ) : (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto max-w-3xl space-y-4">
                {isLoadingMessages && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    id={msg.id}
                    role={msg.role}
                    content={msg.content}
                    fileReferences={msg.fileReferences}
                    resolvedTheme={resolvedTheme}
                    onEdit={handleEditMessage}
                  />
                ))}

                {/* Streaming response */}
                {isStreaming && (
                  <MessageBubble
                    role="assistant"
                    content={streamingContent || ""}
                    thinking={streamingThinking || undefined}
                    fileReferences={streamingFiles.length > 0 ? streamingFiles : null}
                    resolvedTheme={resolvedTheme}
                    isStreaming={true}
                  />
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="border-t border-border p-4">
              <div className="mx-auto max-w-3xl">
                <div className="relative flex items-end gap-2 rounded-lg border border-border bg-background p-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="ask a question... (enter to send, shift+enter for newline)"
                    rows={1}
                    className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 font-mono text-sm placeholder:text-muted-foreground/50 focus:outline-none"
                    style={{ minHeight: "36px" }}
                    disabled={isStreaming}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-30"
                  >
                    {isStreaming ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                  </button>
                </div>
                <p className="mt-1.5 px-2 font-mono text-[10px] text-muted-foreground/50">
                  answers are auto-saved to this conversation
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function MessageBubble({
  id,
  role,
  content,
  fileReferences,
  resolvedTheme,
  isStreaming,
  thinking,
  onEdit,
}: {
  id?: string;
  role: string;
  content: string;
  fileReferences: any;
  resolvedTheme: string | undefined;
  isStreaming?: boolean;
  thinking?: string;
  onEdit?: (messageId: string, newContent: string) => void;
}) {
  const isUser = role === "user";
  const [showFiles, setShowFiles] = useState(false);
  const [userToggledThinking, setUserToggledThinking] = useState(false);
  const [userShowThinking, setUserShowThinking] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);

  // Derived: auto-collapse thinking when answer starts, unless user manually toggled
  const showThinking = userToggledThinking ? userShowThinking : !content;

  const toggleThinking = () => {
    setUserToggledThinking(true);
    setUserShowThinking((prev) => !prev);
  };

  const handleSaveEdit = () => {
    if (editContent.trim() && onEdit && id) {
      onEdit(id, editContent.trim());
      setIsEditing(false);
    }
  };

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
        <div
          className={`rounded-lg px-4 py-3 text-[13px] leading-relaxed ${
            isUser
              ? "bg-primary/10 text-foreground"
              : "border border-border bg-background text-foreground"
          }`}
        >
          {isUser ? (
            isEditing ? (
              <div className="flex flex-col gap-2 min-w-[240px]">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveEdit();
                    } else if (e.key === "Escape") {
                      setEditContent(content);
                      setIsEditing(false);
                    }
                  }}
                  autoFocus
                  rows={2}
                  className="w-full resize-none rounded-md border border-border bg-background p-2 font-mono text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => { setEditContent(content); setIsEditing(false); }}
                    className="font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="font-mono text-[10px] text-primary transition-colors hover:text-primary/80"
                  >
                    send ↵
                  </button>
                </div>
              </div>
            ) : (
              <div className="group relative">
                <p className="whitespace-pre-wrap pr-6">{content}</p>
                {onEdit && id && (
                  <button
                    onClick={() => { setEditContent(content); setIsEditing(true); }}
                    className="absolute -right-1 -top-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
              </div>
            )
          ) : (
            <>
              {/* Thinking section (reasoning models only) */}
              {thinking && (
                <div className="mb-2.5 rounded-md border border-border/40 bg-muted/10 px-3 py-2">
                  <button
                    onClick={toggleThinking}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                  >
                    <Brain className="size-3" />
                    <span>thinking</span>
                    <ChevronRight className={`size-2.5 transition-transform ${showThinking ? "rotate-90" : ""}`} />
                  </button>
                  {showThinking && (
                    <p className="mt-1.5 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-[1.6] text-muted-foreground/60">
                      {thinking}
                    </p>
                  )}
                </div>
              )}

              {content ? (
                <div
                  data-color-mode={resolvedTheme === "dark" ? "dark" : "light"}
                  className="prose prose-sm max-w-none prose-p:leading-relaxed prose-p:my-2 prose-headings:font-mono prose-headings:font-semibold prose-h1:text-base prose-h2:text-sm prose-h3:text-[13px] prose-code:rounded prose-code:bg-muted/40 prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted/40 prose-pre:border prose-pre:rounded-md prose-a:text-primary prose-a:no-underline prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-blockquote:border-l-primary/30 prose-blockquote:pl-3 [&_pre]:!bg-muted/40 [&_pre]:!border [&_code]:!text-foreground"
                >
                  <MDEditor.Markdown source={content} />
                  {isStreaming && (
                    <span className="animate-blink ml-0.5 inline-block h-3.5 w-[7px] translate-y-[1px] bg-primary" />
                  )}
                </div>
              ) : !thinking ? (
                <div className="flex items-center gap-2 py-1">
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                  <span className="font-mono text-[11px] text-muted-foreground">thinking…</span>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* File references */}
        {fileReferences && fileReferences.length > 0 && (
          <div className="w-full">
            <button
              onClick={() => setShowFiles(!showFiles)}
              className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-primary"
            >
              <ChevronRight
                className={`size-3 transition-transform ${showFiles ? "rotate-90" : ""}`}
              />
              {fileReferences.length} file{fileReferences.length > 1 ? "s" : ""} referenced
            </button>
            {showFiles && (
              <div className="mt-1.5">
                <CodeReferences fileReferences={fileReferences} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default QAPage;
