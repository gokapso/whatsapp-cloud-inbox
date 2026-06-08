"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  formatDistanceToNow,
  isValid,
  isToday,
  isYesterday,
  differenceInHours,
} from "date-fns";
import {
  RefreshCw,
  Paperclip,
  Send,
  X,
  AlertCircle,
  MessageSquare,
  XCircle,
  ListTree,
  ArrowLeft,
  Check,
  Reply,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONVERSATIONS_QUERY_KEY,
  type Conversation,
  type Message,
  conversationMessagesQueryKey,
  fetchConversationMessages,
  normalizeMessages,
  phoneThreadMessagesQueryKey,
  shortConversationId,
} from "@/lib/inbox-data";
import { MediaMessage } from "@/components/media-message";
import { TemplateSelectorDialog } from "@/components/template-selector-dialog";
import { InteractiveMessageDialog } from "@/components/interactive-message-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";

function formatMessageTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isValid(date)) {
      return format(date, "HH:mm");
    }
    return "";
  } catch {
    return "";
  }
}

function formatDateDivider(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return "";

    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    return format(date, "MMMM d, yyyy");
  } catch {
    return "";
  }
}

function formatLastSeen(timestamp?: string): string | null {
  if (!timestamp) return null;

  try {
    const date = new Date(timestamp);
    if (!isValid(date)) return null;

    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return null;
  }
}

function formatDisplayPhoneNumber(phoneNumber?: string): string | null {
  if (!phoneNumber) return null;

  const trimmedPhoneNumber = phoneNumber.trim();
  if (!trimmedPhoneNumber) return null;
  if (trimmedPhoneNumber.startsWith("+")) return trimmedPhoneNumber;
  if (/^\d+$/.test(trimmedPhoneNumber)) return `+${trimmedPhoneNumber}`;

  return trimmedPhoneNumber;
}

function MessageStatusChecks({ status }: { status: string }) {
  if (status === "read" || status === "delivered") {
    return (
      <span
        aria-label={status === "read" ? "Read" : "Delivered"}
        className="relative inline-flex h-3.5 w-[1.125rem] items-center text-[var(--chat-check)]"
      >
        <Check aria-hidden="true" className="absolute left-0 top-0 size-3.5" />
        <Check aria-hidden="true" className="absolute right-0 top-0 size-3.5" />
      </span>
    );
  }

  if (status === "sent") {
    return (
      <Check aria-label="Sent" className="size-3.5 text-[var(--chat-check)]" />
    );
  }

  return null;
}

function shouldShowDateDivider(
  currentMsg: Message,
  prevMsg: Message | null,
): boolean {
  if (!prevMsg) return true;

  try {
    const currentDate = new Date(currentMsg.createdAt);
    const prevDate = new Date(prevMsg.createdAt);

    if (!isValid(currentDate) || !isValid(prevDate)) return false;

    return format(currentDate, "yyyy-MM-dd") !== format(prevDate, "yyyy-MM-dd");
  } catch {
    return false;
  }
}

function shouldShowConversationDivider(
  currentMsg: Message,
  prevMsg: Message | null,
): boolean {
  return Boolean(
    prevMsg && currentMsg.conversationId !== prevMsg.conversationId,
  );
}

function isWithin24HourWindow(messages: Message[]): boolean {
  // Find the last inbound message
  const inboundMessages = messages.filter((msg) => msg.direction === "inbound");

  if (inboundMessages.length === 0) {
    // No inbound messages yet - only templates allowed
    return false;
  }

  const lastInboundMessage = inboundMessages[inboundMessages.length - 1];

  try {
    const lastMessageDate = new Date(lastInboundMessage.createdAt);
    if (!isValid(lastMessageDate)) return false;

    const hoursSinceLastMessage = differenceInHours(
      new Date(),
      lastMessageDate,
    );
    return hoursSinceLastMessage < 24;
  } catch {
    return false; // In case of error, only allow templates
  }
}

function getDisabledInputMessage(messages: Message[]): string {
  const inboundMessages = messages.filter((msg) => msg.direction === "inbound");

  if (inboundMessages.length === 0) {
    return "User hasn't messaged yet. Send a template message or wait for them to reply.";
  }

  return "Last message was over 24 hours ago. Send a template message or wait for the user to message you.";
}

const MESSAGE_SKELETON_WIDTHS = [280, 180, 320, 210, 260, 170];
const LOCAL_REPLY_CONTEXT_STORAGE_KEY = "whatsapp-cloud-inbox-reply-contexts";
const LOCAL_REPLY_CONTEXT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOCAL_REPLY_CONTEXTS = 200;

type RepliedToMessage = NonNullable<Message["repliedTo"]>;

type LocalReplyContext = {
  contextMessageId: string;
  repliedTo: RepliedToMessage;
  createdAt: number;
};

type LocalReplyContexts = Record<string, LocalReplyContext>;

type SendMessageResult = {
  messages?: Array<{ id?: string }>;
  messageId?: string;
  id?: string;
  contextMessageId?: string;
};

function extractTranscriptDisplayContent(content: string): string | undefined {
  const match = content.match(/\bTranscript:\s*[\s\S]*$/i);
  if (!match) return undefined;

  return match[0]
    .replace(/\s+\bURL:\s*https?:\/\/\S+[\s\S]*$/i, '')
    .trim();
}

function isGeneratedAttachmentDisplayContent(content: string): boolean {
  return (
    /^https?:\/\//i.test(content) ||
    /\bURL:\s*https?:\/\//i.test(content) ||
    /^(image|audio)\s+attached\b/i.test(content)
  );
}

function getDisplayMessageContent(message: Message): string | null {
  if (!message.content || message.content === "[Image attached]") {
    return null;
  }

  const trimmedContent = message.content.trim();

  if (message.messageType === 'audio') {
    return extractTranscriptDisplayContent(trimmedContent) ??
      (isGeneratedAttachmentDisplayContent(trimmedContent) ? null : trimmedContent);
  }

  if (
    message.messageType === 'image' &&
    isGeneratedAttachmentDisplayContent(trimmedContent)
  ) {
    return null;
  }

  return trimmedContent;
}

function getReplyPreviewContent(message: Message): string {
  const content = getDisplayMessageContent(message) || message.caption || message.filename || '';
  const trimmedContent = content.trim();

  if (trimmedContent) {
    return trimmedContent.length > 140 ? `${trimmedContent.slice(0, 137)}...` : trimmedContent;
  }

  if (message.hasMedia && message.messageType) {
    return `${message.messageType.charAt(0).toUpperCase()}${message.messageType.slice(1)} message`;
  }

  return 'Message';
}

function getMessageSenderLabel(
  message: Pick<Message, 'direction'>,
  contactName?: string,
  phoneNumber?: string,
): string {
  if (message.direction === 'outbound') return 'you';
  return contactName || phoneNumber || 'contact';
}

function extractSentMessageId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;

  const sendResult = result as SendMessageResult;
  const sentMessageId = sendResult.messages?.find((message) => typeof message.id === "string")?.id;

  return sentMessageId ?? sendResult.messageId ?? sendResult.id ?? null;
}

function pruneLocalReplyContexts(contexts: LocalReplyContexts): LocalReplyContexts {
  const now = Date.now();
  const entries = Object.entries(contexts)
    .filter(([, context]) => (
      context &&
      typeof context.contextMessageId === "string" &&
      context.repliedTo &&
      typeof context.repliedTo.id === "string" &&
      now - context.createdAt < LOCAL_REPLY_CONTEXT_MAX_AGE_MS
    ))
    .sort(([, a], [, b]) => b.createdAt - a.createdAt)
    .slice(0, MAX_LOCAL_REPLY_CONTEXTS);

  return Object.fromEntries(entries);
}

type Props = {
  conversationId?: string;
  conversations?: Conversation[];
  phoneNumber?: string;
  phoneNumberId?: string;
  inboxPhoneNumber?: string;
  inboxDisplayName?: string;
  contactName?: string;
  lastActiveAt?: string;
  onTemplateSent?: (phoneNumber: string, phoneNumberId?: string) => Promise<void>;
  onBack?: () => void;
  isVisible?: boolean;
};

export function MessageView({
  conversationId,
  conversations = [],
  phoneNumber,
  phoneNumberId,
  inboxPhoneNumber,
  inboxDisplayName,
  contactName,
  lastActiveAt,
  onTemplateSent,
  onBack,
  isVisible = false,
}: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [canSendRegularMessage, setCanSendRegularMessage] = useState(true);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showInteractiveDialog, setShowInteractiveDialog] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastInitialScrollKeyRef = useRef("");
  const highlightTimeoutRef = useRef<number | null>(null);
  const localReplyContextsRef = useRef<LocalReplyContexts>({});
  const [localReplyContextVersion, setLocalReplyContextVersion] = useState(0);
  const queryClient = useQueryClient();
  const lastSeenText = formatLastSeen(lastActiveAt);
  const displayPhoneNumber = formatDisplayPhoneNumber(phoneNumber);
  const displayInboxPhoneNumber = formatDisplayPhoneNumber(inboxPhoneNumber);
  const threadConversationIds = useMemo(() => {
    const conversationIds = conversations.map(
      (conversation) => conversation.id,
    );
    return conversationIds.length > 0
      ? conversationIds
      : conversationId
        ? [conversationId]
        : [];
  }, [conversationId, conversations]);
  const threadMessagesQueryKey = useMemo(
    () => phoneThreadMessagesQueryKey(phoneNumberId, phoneNumber, threadConversationIds),
    [phoneNumberId, phoneNumber, threadConversationIds],
  );
  const threadKey = threadConversationIds.join(":");
  const initialScrollKey = `${conversationId ?? ""}:${threadKey}`;

  const getScrollViewport = useCallback(() => {
    return (
      messagesContainerRef.current?.querySelector<HTMLElement>(
        "[data-radix-scroll-area-viewport]",
      ) ?? null
    );
  }, []);

  const scrollToBottom = useCallback(() => {
    const viewport = getScrollViewport();

    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }

    messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
  }, [getScrollViewport]);

  const scrollToSelectedConversation = useCallback(() => {
    const viewport = getScrollViewport();

    if (!viewport || !conversationId) {
      scrollToBottom();
      return;
    }

    const selectedConversationMessages = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-conversation-id]"),
    ).filter((element) => element.dataset.conversationId === conversationId);
    const targetMessage =
      selectedConversationMessages[selectedConversationMessages.length - 1];

    if (targetMessage) {
      targetMessage.scrollIntoView({ behavior: "auto", block: "center" });
      return;
    }

    scrollToBottom();
  }, [conversationId, getScrollViewport, scrollToBottom]);

  const scrollToMessage = useCallback((messageId: string) => {
    const viewport = getScrollViewport();
    if (!viewport) return;

    const targetMessage = Array.from(
      viewport.querySelectorAll<HTMLElement>("[data-message-id]"),
    ).find((element) => element.dataset.messageId === messageId);

    if (!targetMessage) return;

    targetMessage.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);

    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }

    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedMessageId(null);
      highlightTimeoutRef.current = null;
    }, 2_000);
  }, [getScrollViewport]);

  const handleReplyToMessage = useCallback((message: Message) => {
    setReplyingToMessage(message);
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus();
    });
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyingToMessage(null);
  }, []);

  const persistLocalReplyContexts = useCallback((contexts: LocalReplyContexts) => {
    const prunedContexts = pruneLocalReplyContexts(contexts);
    localReplyContextsRef.current = prunedContexts;
    setLocalReplyContextVersion((version) => version + 1);

    try {
      window.localStorage.setItem(
        LOCAL_REPLY_CONTEXT_STORAGE_KEY,
        JSON.stringify(prunedContexts),
      );
    } catch {
      // Keeping the in-memory map is enough for the current session.
    }
  }, []);

  const rememberLocalReplyContext = useCallback((sentMessageId: string, replyTarget: Message) => {
    persistLocalReplyContexts({
      ...localReplyContextsRef.current,
      [sentMessageId]: {
        contextMessageId: replyTarget.id,
        repliedTo: {
          id: replyTarget.id,
          conversationId: replyTarget.conversationId,
          content: getReplyPreviewContent(replyTarget),
          direction: replyTarget.direction,
          messageType: replyTarget.messageType,
          senderName: getMessageSenderLabel(replyTarget, contactName, phoneNumber),
        },
        createdAt: Date.now(),
      },
    });
  }, [contactName, persistLocalReplyContexts, phoneNumber]);

  const applyLocalReplyContexts = useCallback((inputMessages: Message[]) => {
    const localReplyContexts = localReplyContextsRef.current;
    if (Object.keys(localReplyContexts).length === 0) return inputMessages;

    return inputMessages.map((message) => {
      if (message.contextMessageId || message.repliedTo) return message;

      const localReplyContext = localReplyContexts[message.id];
      if (!localReplyContext) return message;

      return {
        ...message,
        contextMessageId: localReplyContext.contextMessageId,
        repliedTo: localReplyContext.repliedTo,
      };
    });
  }, []);

  const fetchThreadMessages = useCallback(async () => {
    if (threadConversationIds.length === 0) return [];

    const latestConversationId = threadConversationIds[0];
    const messageBatches = await Promise.all(
      threadConversationIds.map((threadConversationId) => {
        const queryKey = conversationMessagesQueryKey(phoneNumberId, threadConversationId);
        const cachedMessages = queryClient.getQueryData<Message[]>(queryKey);

        if (cachedMessages && threadConversationId !== latestConversationId) {
          return cachedMessages;
        }

        return queryClient.fetchQuery({
          queryKey,
          queryFn: () => fetchConversationMessages(threadConversationId, phoneNumberId),
          staleTime: 0,
        });
      }),
    );

    return applyLocalReplyContexts(normalizeMessages(messageBatches.flat()));
  }, [applyLocalReplyContexts, phoneNumberId, queryClient, threadConversationIds]);

  const { data: messages = [], isPending: loading } = useQuery({
    queryKey: threadMessagesQueryKey,
    queryFn: fetchThreadMessages,
    enabled: threadConversationIds.length > 0,
    refetchInterval: 5_000,
    refetchOnMount: false,
  });

  useEffect(() => {
    try {
      const storedContexts = window.localStorage.getItem(LOCAL_REPLY_CONTEXT_STORAGE_KEY);
      if (!storedContexts) return;

      const parsedContexts = JSON.parse(storedContexts);
      if (parsedContexts && typeof parsedContexts === "object" && !Array.isArray(parsedContexts)) {
        persistLocalReplyContexts(parsedContexts as LocalReplyContexts);
      }
    } catch {
      localReplyContextsRef.current = {};
    }
  }, [persistLocalReplyContexts]);

  useEffect(() => {
    const currentMessages = queryClient.getQueryData<Message[]>(threadMessagesQueryKey);
    if (!currentMessages) return;

    queryClient.setQueryData(
      threadMessagesQueryKey,
      applyLocalReplyContexts(currentMessages),
    );
  }, [applyLocalReplyContexts, localReplyContextVersion, queryClient, threadMessagesQueryKey]);

  const refreshCurrentThread = useCallback(async () => {
    if (threadConversationIds.length === 0) return;

    const messageBatches = await Promise.all(
      threadConversationIds.map((threadConversationId) =>
        queryClient.fetchQuery({
          queryKey: conversationMessagesQueryKey(phoneNumberId, threadConversationId),
          queryFn: () => fetchConversationMessages(threadConversationId, phoneNumberId),
          staleTime: 0,
        }),
      ),
    );

    queryClient.setQueryData(
      threadMessagesQueryKey,
      applyLocalReplyContexts(normalizeMessages(messageBatches.flat())),
    );
  }, [applyLocalReplyContexts, phoneNumberId, queryClient, threadConversationIds, threadMessagesQueryKey]);

  useEffect(() => {
    if (isNearBottom) {
      scrollToBottom();
    }
  }, [messages, isNearBottom, scrollToBottom]);

  useEffect(() => {
    if (loading || messages.length === 0 || !threadKey) return;
    if (lastInitialScrollKeyRef.current === initialScrollKey) return;

    lastInitialScrollKeyRef.current = initialScrollKey;
    setIsNearBottom(true);

    const viewport = getScrollViewport();
    const content = viewport?.firstElementChild;
    let animationFrameId = 0;
    let secondAnimationFrameId = 0;
    let timeoutId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let stopped = false;

    const stopInitialScrollSync = () => {
      stopped = true;
      window.cancelAnimationFrame(animationFrameId);
      window.cancelAnimationFrame(secondAnimationFrameId);
      window.clearTimeout(timeoutId);
      resizeObserver?.disconnect();
      viewport?.removeEventListener("wheel", stopInitialScrollSync);
      viewport?.removeEventListener("touchstart", stopInitialScrollSync);
    };

    const syncSelectedConversationScroll = () => {
      if (stopped) return;

      scrollToSelectedConversation();
    };

    if (viewport) {
      viewport.addEventListener("wheel", stopInitialScrollSync, {
        passive: true,
      });
      viewport.addEventListener("touchstart", stopInitialScrollSync, {
        passive: true,
      });
    }

    if (typeof ResizeObserver !== "undefined" && content) {
      resizeObserver = new ResizeObserver(syncSelectedConversationScroll);
      resizeObserver.observe(content);
    }

    syncSelectedConversationScroll();
    animationFrameId = window.requestAnimationFrame(() => {
      syncSelectedConversationScroll();
      secondAnimationFrameId = window.requestAnimationFrame(
        syncSelectedConversationScroll,
      );
    });
    timeoutId = window.setTimeout(stopInitialScrollSync, 1_000);

    return stopInitialScrollSync;
  }, [
    getScrollViewport,
    initialScrollKey,
    loading,
    messages.length,
    scrollToSelectedConversation,
    threadKey,
  ]);

  useEffect(() => {
    setCanSendRegularMessage(isWithin24HourWindow(messages));
  }, [messages]);

  useEffect(() => {
    setReplyingToMessage(null);
  }, [threadKey]);

  useEffect(() => {
    if (!canSendRegularMessage) {
      setReplyingToMessage(null);
    }
  }, [canSendRegularMessage]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  // Track if user is near bottom of scroll
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const viewport = container.querySelector(
        "[data-radix-scroll-area-viewport]",
      );
      if (!viewport) return;

      const { scrollTop, scrollHeight, clientHeight } = viewport;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setIsNearBottom(distanceFromBottom < 100);
    };

    const viewport = container.querySelector(
      "[data-radix-scroll-area-viewport]",
    );
    if (viewport) {
      viewport.addEventListener("scroll", handleScroll);
      return () => viewport.removeEventListener("scroll", handleScroll);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshCurrentThread();
    } finally {
      setRefreshing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!messageInput.trim() && !selectedFile) || !phoneNumber || sending)
      return;

    const replyTarget = replyingToMessage;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("to", phoneNumber);
      if (phoneNumberId) {
        formData.append("phoneNumberId", phoneNumberId);
      }
      if (replyingToMessage?.id) {
        formData.append("contextMessageId", replyingToMessage.id);
      }
      if (messageInput.trim()) {
        formData.append("body", messageInput);
      }
      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const response = await fetch("/api/messages/send", {
        method: "POST",
        body: formData,
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Failed to send message");
      }

      const sentMessageId = extractSentMessageId(data);
      if (sentMessageId && replyTarget) {
        rememberLocalReplyContext(sentMessageId, replyTarget);
      }

      setMessageInput("");
      setReplyingToMessage(null);
      handleRemoveFile();
      await queryClient.invalidateQueries({
        queryKey: CONVERSATIONS_QUERY_KEY,
      });
      await refreshCurrentThread();
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setSending(false);
    }
  };

  const handleTemplateSent = async () => {
    await refreshCurrentThread();

    if (phoneNumber && onTemplateSent) {
      await onTemplateSent(phoneNumber, phoneNumberId);
    }
  };

  if (!conversationId) {
    return (
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 items-center justify-center bg-muted/50 p-6 text-center",
          !isVisible && "hidden md:flex",
        )}
      >
        <p className="max-w-sm text-sm leading-6 text-muted-foreground">
          Select a conversation to view messages
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--chat-canvas)]",
          !isVisible && "hidden md:flex",
        )}
      >
        <div className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-toolbar)] p-2.5 safe-area-top sm:p-3">
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 flex-1">
              {onBack && (
                <Button
                  onClick={onBack}
                  variant="ghost"
                  size="icon"
                  className="size-11 text-muted-foreground hover:bg-[var(--chat-hover)] md:hidden"
                  aria-label="Back to conversations"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              )}
              <div className="flex-1">
                <Skeleton className="h-5 w-40 mb-1" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle className="size-11 md:hidden" />
              <Skeleton className="size-10 rounded-lg" />
            </div>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 lg:p-6">
          <div className="mx-auto w-full max-w-[900px] space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className={cn(
                  "flex mb-2",
                  i % 2 === 0 ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[min(88%,34rem)] rounded-lg px-3 py-2 shadow-sm sm:max-w-[min(78%,38rem)] lg:max-w-[min(70%,42rem)]",
                    i % 2 === 0 ? "rounded-br-none" : "rounded-bl-none",
                  )}
                >
                  <Skeleton
                    className="h-4 max-w-full mb-2"
                    style={{ width: `${MESSAGE_SKELETON_WIDTHS[i - 1]}px` }}
                  />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--chat-canvas)]",
        !isVisible && "hidden md:flex",
      )}
    >
      <div className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-toolbar)] p-2.5 safe-area-top sm:p-3">
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {onBack && (
              <Button
                onClick={onBack}
                variant="ghost"
                size="icon"
                className="size-11 flex-shrink-0 text-muted-foreground hover:bg-[var(--chat-hover)] md:hidden"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div className="flex-1 min-w-0">
              <h2 className="truncate text-sm font-medium text-foreground sm:text-base">
                {contactName || phoneNumber || "Conversation"}
              </h2>
              {displayPhoneNumber && (
                <p className="truncate text-xs text-muted-foreground">
                  {lastSeenText
                    ? `Active · ${lastSeenText} · ${displayPhoneNumber}`
                    : displayPhoneNumber}
                </p>
              )}
              {(inboxDisplayName || displayInboxPhoneNumber) && (
                <p className="truncate text-[11px] text-muted-foreground/80">
                  via {inboxDisplayName || displayInboxPhoneNumber}
                  {inboxDisplayName && displayInboxPhoneNumber ? ` · ${displayInboxPhoneNumber}` : ''}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="size-11 md:hidden" />
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground hover:bg-[var(--chat-hover)] md:size-10"
              aria-label="Refresh messages"
              title="Refresh messages"
            >
              <RefreshCw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea
        ref={messagesContainerRef}
        className="h-0 flex-1 overscroll-contain p-3 sm:p-4 lg:p-6"
      >
        <div className="mx-auto w-full max-w-[900px]">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No messages yet
            </p>
          ) : (
            messages.map((message, index) => {
              const prevMessage = index > 0 ? messages[index - 1] : null;
              const showDateDivider = shouldShowDateDivider(
                message,
                prevMessage,
              );
              const showConversationDivider = shouldShowConversationDivider(
                message,
                prevMessage,
              );
              const displayMessageContent = getDisplayMessageContent(message);
              const isHighlighted = highlightedMessageId === message.id;

              return (
                <div
                  key={message.id}
                  data-message-id={message.id}
                  data-conversation-id={message.conversationId}
                >
                  {showConversationDivider && (
                    <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
                      <div className="h-px flex-1 bg-[var(--chat-border)]" />
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--chat-canvas)] px-2 py-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--chat-presence)]" />
                        Conversation{" "}
                        {shortConversationId(message.conversationId)}
                      </span>
                      <div className="h-px flex-1 bg-[var(--chat-border)]" />
                    </div>
                  )}

                  {showDateDivider && (
                    <div className="flex justify-center my-4">
                      <Badge variant="secondary" className="shadow-sm">
                        {formatDateDivider(message.createdAt)}
                      </Badge>
                    </div>
                  )}

                  <div
                    className={cn(
                      "group flex mb-2 items-start gap-1.5 rounded-lg px-1 py-0.5 transition-colors",
                      message.direction === "outbound"
                        ? "justify-end"
                        : "justify-start",
                      isHighlighted && "bg-primary/10",
                    )}
                  >
                    {message.direction === "outbound" && canSendRegularMessage && (
                      <Button
                        type="button"
                        onClick={() => handleReplyToMessage(message)}
                        variant="ghost"
                        size="icon"
                        className="mt-1 size-7 flex-shrink-0 text-muted-foreground opacity-100 hover:bg-[var(--chat-hover)] sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="Reply to message"
                        title="Reply"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <div
                      className={cn(
                        "relative max-w-[min(88%,34rem)] rounded-lg px-3 py-2 shadow-sm transition-shadow sm:max-w-[min(78%,38rem)] lg:max-w-[min(70%,42rem)]",
                        message.direction === "outbound"
                          ? "bg-[var(--chat-bubble-outgoing)] text-foreground rounded-br-none"
                          : "bg-[var(--chat-bubble-incoming)] text-foreground rounded-bl-none",
                        isHighlighted && "ring-2 ring-primary/35",
                      )}
                    >
                      {message.repliedTo && (
                        <button
                          type="button"
                          onClick={() => scrollToMessage(message.repliedTo!.id)}
                          className="mb-2 block w-full rounded border-l-2 border-primary/60 bg-background/45 px-2 py-1.5 text-left hover:bg-background/70"
                        >
                          <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-primary">
                            <Reply className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {message.repliedTo.senderName ||
                                getMessageSenderLabel(message.repliedTo, contactName, phoneNumber)}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {message.repliedTo.content}
                          </span>
                        </button>
                      )}

                      {message.hasMedia && message.mediaData?.url ? (
                        <div className="mb-2">
                          {message.messageType === "sticker" ? (
                            <img
                              src={message.mediaData.url}
                              alt="Sticker"
                              className="h-auto max-h-[150px] max-w-[150px]"
                            />
                          ) : message.mediaData.contentType?.startsWith(
                              "image/",
                            ) || message.messageType === "image" ? (
                            <img
                              src={message.mediaData.url}
                              alt="Media"
                              className="h-auto max-h-96 max-w-full rounded outline outline-1 [outline-color:var(--chat-media-outline)]"
                            />
                          ) : message.mediaData.contentType?.startsWith(
                              "video/",
                            ) || message.messageType === "video" ? (
                            <video
                              src={message.mediaData.url}
                              controls
                              className="h-auto max-h-96 max-w-full rounded outline outline-1 [outline-color:var(--chat-media-outline)]"
                            />
                          ) : message.mediaData.contentType?.startsWith(
                              "audio/",
                            ) || message.messageType === "audio" ? (
                            <audio
                              src={message.mediaData.url}
                              controls
                              className="w-full"
                            />
                          ) : (
                            <a
                              href={message.mediaData.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={cn(
                                "flex min-w-0 items-center gap-2 text-sm underline hover:opacity-80",
                                message.direction === "outbound"
                                  ? "text-primary"
                                  : "text-primary",
                              )}
                            >
                              <Paperclip className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">
                                {message.mediaData.filename ||
                                  message.filename ||
                                  "Download file"}
                              </span>
                            </a>
                          )}
                        </div>
                      ) : message.metadata?.mediaId && message.messageType ? (
                        <div className="mb-2">
                          <MediaMessage
                            mediaId={message.metadata.mediaId}
                            phoneNumberId={message.phoneNumberId || phoneNumberId}
                            messageType={message.messageType}
                            caption={message.caption}
                            filename={message.filename}
                            isOutbound={message.direction === "outbound"}
                          />
                        </div>
                      ) : null}

                      {message.caption && (
                        <p className="text-sm break-words whitespace-pre-wrap mb-1">
                          {message.caption}
                        </p>
                      )}

                      {displayMessageContent && (
                        <p className="text-sm break-words whitespace-pre-wrap">
                          {displayMessageContent}
                        </p>
                      )}

                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {formatMessageTime(message.createdAt)}
                        </span>

                        {message.direction === "outbound" && message.status && (
                          <>
                            {message.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-red-500" />
                            ) : (
                              <MessageStatusChecks status={message.status} />
                            )}
                          </>
                        )}
                      </div>

                      {message.direction === "outbound" &&
                        message.status === "failed" && (
                          <div className="mt-1">
                            <span className="text-[11px] text-red-500 flex items-center gap-1">
                              Not delivered
                            </span>
                          </div>
                        )}

                      {message.reactionEmoji && (
                        <div className="absolute -bottom-2 -right-2 bg-background rounded-full px-1.5 py-0.5 text-sm shadow-sm border">
                          {message.reactionEmoji}
                        </div>
                      )}
                    </div>
                    {message.direction === "inbound" && canSendRegularMessage && (
                      <Button
                        type="button"
                        onClick={() => handleReplyToMessage(message)}
                        variant="ghost"
                        size="icon"
                        className="mt-1 size-7 flex-shrink-0 text-muted-foreground opacity-100 hover:bg-[var(--chat-hover)] sm:opacity-0 sm:group-hover:opacity-100"
                        aria-label="Reply to message"
                        title="Reply"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <div className="border-t border-[var(--chat-border-strong)] bg-[var(--chat-toolbar)] safe-area-bottom">
        {canSendRegularMessage ? (
          <>
            {replyingToMessage && (
              <div className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-surface)] px-3 py-2">
                <div className="mx-auto flex w-full max-w-[900px] items-center gap-2">
                  <Reply className="h-4 w-4 flex-shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-primary">
                      Replying to {getMessageSenderLabel(replyingToMessage, contactName, phoneNumber)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {getReplyPreviewContent(replyingToMessage)}
                    </p>
                  </div>
                  <Button
                    onClick={handleCancelReply}
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 flex-shrink-0 text-muted-foreground"
                    aria-label="Cancel reply"
                    title="Cancel reply"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {selectedFile && (
              <div className="border-b border-[var(--chat-border-strong)] bg-[var(--chat-surface)] p-3">
                <div className="mx-auto flex w-full max-w-[900px] items-start gap-3">
                  {filePreview ? (
                    <img
                      src={filePreview}
                      alt="Preview"
                      className="size-16 rounded object-cover outline outline-1 [outline-color:var(--chat-media-outline)]"
                    />
                  ) : (
                    <div className="flex size-16 items-center justify-center rounded bg-[var(--chat-hover)]">
                      <Paperclip className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    onClick={handleRemoveFile}
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 text-muted-foreground md:size-10"
                    aria-label="Remove selected file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            <form
              onSubmit={handleSendMessage}
              className="mx-auto flex w-full max-w-[900px] items-end gap-1.5 px-2.5 py-2 sm:gap-2 sm:p-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept="image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                variant="ghost"
                size="icon"
                className="size-11 text-muted-foreground hover:bg-[var(--chat-icon-hover)] md:size-10"
                aria-label="Upload file"
                title="Upload file"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                onClick={() => setShowInteractiveDialog(true)}
                disabled={sending}
                size="icon"
                variant="ghost"
                className="size-11 text-muted-foreground hover:bg-[var(--chat-hover)] hover:text-primary md:size-10"
                aria-label="Send interactive message"
                title="Send interactive message"
              >
                <ListTree className="h-5 w-5" />
              </Button>
              <Input
                ref={messageInputRef}
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message"
                disabled={sending}
                aria-label="Message"
                className="h-11 min-w-0 flex-1 rounded-lg border-[var(--chat-border-strong)] bg-[var(--chat-input)] text-base focus-visible:ring-primary md:h-10 md:text-sm"
              />
              <Button
                type="submit"
                disabled={sending || (!messageInput.trim() && !selectedFile)}
                size="icon"
                className="size-11 rounded-full bg-primary hover:bg-[var(--primary-hover)] md:size-10"
                aria-label="Send message"
              >
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </>
        ) : (
          <div className="mx-auto w-full max-w-[900px] p-3">
            <div className="bg-[var(--chat-warning-background)] border border-[var(--chat-warning-border)] rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-[var(--chat-warning-foreground)] flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground mb-3">
                    {getDisabledInputMessage(messages)}
                  </p>
                  <Button
                    onClick={() => setShowTemplateDialog(true)}
                    className="h-11 bg-primary hover:bg-[var(--primary-hover)] md:h-9"
                    size="sm"
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Send template
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <TemplateSelectorDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        phoneNumber={phoneNumber || ""}
        phoneNumberId={phoneNumberId}
        onTemplateSent={handleTemplateSent}
      />

      <InteractiveMessageDialog
        open={showInteractiveDialog}
        onOpenChange={setShowInteractiveDialog}
        conversationId={conversationId}
        phoneNumber={phoneNumber}
        phoneNumberId={phoneNumberId}
        onMessageSent={async () => {
          await queryClient.invalidateQueries({
            queryKey: CONVERSATIONS_QUERY_KEY,
          });
          await refreshCurrentThread();
        }}
      />
    </div>
  );
}
