"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  format,
  formatDistanceToNow,
  isValid,
  isToday,
  isYesterday,
} from "date-fns";
import {
  RefreshCw,
  Paperclip,
  X,
  AlertCircle,
  MessageSquare,
  XCircle,
  ArrowLeft,
  Check,
  Reply,
  Loader2,
  CheckCircle2,
  RotateCcw,
  PanelRight,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CONVERSATIONS_QUERY_KEY,
  type Conversation,
  type ConversationPage,
  type Message,
  getReplyPreviewContent,
  phoneThreadMessagesQueryKey,
  shortConversationId,
} from "@/lib/inbox-data";
import { isWithinServiceWindow } from '@/lib/service-window';
import { useThreadMessages } from '@/hooks/use-thread-messages';
import { getIdentityLabel, getRecipientAddress } from '@/lib/whatsapp-identity';
import { getInboxErrorMessage, readInboxResponse } from '@/lib/inbox-errors';
import { MediaMessage } from "@/components/media-message";
import { TemplateSelectorDialog } from "@/components/template-selector-dialog";
import { InteractiveMessageDialog } from "@/components/interactive-message-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { ContactAvatar } from '@/components/contact-avatar';
import { MessageComposer } from '@/components/message-composer';
import { ConversationDetails } from '@/components/conversation-details';
import { WhatsappFormattedText } from '@/components/whatsapp-formatted-text';
import { StructuredMessage } from '@/components/structured-message';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function formatMessageTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    if (isValid(date)) {
      return format(date, "hh:mm a");
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
    return format(date, "EEEE, MMM d");
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

function getDisabledInputMessage(messages: Message[], lastInboundAt?: string): string {
  const inboundMessages = messages.filter((msg) => msg.direction === "inbound");

  if (inboundMessages.length === 0 && !lastInboundAt) {
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
  businessScopedUserId?: string;
  parentBusinessScopedUserId?: string;
  username?: string;
  lastInboundAt?: string;
  phoneNumberId?: string;
  inboxPhoneNumber?: string;
  inboxDisplayName?: string;
  contactName?: string;
  lastActiveAt?: string;
  onTemplateSent?: () => Promise<void>;
  onBack?: () => void;
  isVisible?: boolean;
};

export function MessageView({
  conversationId,
  conversations = [],
  phoneNumber,
  businessScopedUserId,
  parentBusinessScopedUserId,
  username,
  lastInboundAt,
  phoneNumberId,
  inboxPhoneNumber,
  inboxDisplayName,
  contactName,
  lastActiveAt,
  onTemplateSent,
  onBack,
  isVisible = false,
}: Props) {
  const identity = { phoneNumber, businessScopedUserId, parentBusinessScopedUserId, username, contactName };
  const recipientAddress = getRecipientAddress(identity);
  const recipientKey = JSON.stringify(recipientAddress);
  const contactLabel = getIdentityLabel(identity);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showInteractiveDialog, setShowInteractiveDialog] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const lastInitialScrollKeyRef = useRef("");
  const highlightTimeoutRef = useRef<number | null>(null);
  const [localReplyContexts, setLocalReplyContexts] = useState<LocalReplyContexts>({});
  const queryClient = useQueryClient();
  const lastSeenText = formatLastSeen(lastActiveAt);
  const displayPhoneNumber = formatDisplayPhoneNumber(phoneNumber);
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
    () => phoneThreadMessagesQueryKey(phoneNumberId, recipientKey, threadConversationIds),
    [phoneNumberId, recipientKey, threadConversationIds],
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
      viewport.scrollTop += targetMessage.getBoundingClientRect().bottom - viewport.getBoundingClientRect().bottom + 16;
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

    viewport.scrollTo({ top: viewport.scrollTop + targetMessage.getBoundingClientRect().top - viewport.getBoundingClientRect().top - (viewport.clientHeight - targetMessage.clientHeight) / 2, behavior: 'smooth' });
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
    setLocalReplyContexts(prunedContexts);

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
      ...localReplyContexts,
      [sentMessageId]: {
        contextMessageId: replyTarget.id,
        repliedTo: {
          id: replyTarget.id,
          conversationId: replyTarget.conversationId,
          content: getReplyPreviewContent(replyTarget, 140, getDisplayMessageContent(replyTarget)),
          direction: replyTarget.direction,
          messageType: replyTarget.messageType,
          senderName: getMessageSenderLabel(replyTarget, contactLabel, phoneNumber),
        },
        createdAt: Date.now(),
      },
    });
  }, [contactLabel, localReplyContexts, persistLocalReplyContexts, phoneNumber]);

  const applyLocalReplyContexts = useCallback((inputMessages: Message[]) => {
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
  }, [localReplyContexts]);

  const { messages: rawMessages, isPending: loading, error: historyError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useThreadMessages(threadMessagesQueryKey, threadConversationIds, phoneNumberId);
  const messages = useMemo(() => applyLocalReplyContexts(rawMessages), [applyLocalReplyContexts, rawMessages]);
  const canSendRegularMessage = isWithinServiceWindow(messages, lastInboundAt);

  useEffect(() => {
    try {
      const storedContexts = window.localStorage.getItem(LOCAL_REPLY_CONTEXT_STORAGE_KEY);
      if (!storedContexts) return;

      const parsedContexts = JSON.parse(storedContexts);
      if (parsedContexts && typeof parsedContexts === "object" && !Array.isArray(parsedContexts)) {
        persistLocalReplyContexts(parsedContexts as LocalReplyContexts);
      }
    } catch {
      setLocalReplyContexts({});
    }
  }, [persistLocalReplyContexts]);

  const refreshCurrentThread = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: threadMessagesQueryKey }, { throwOnError: true });
  }, [queryClient, threadMessagesQueryKey]);

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
    setReplyingToMessage(null);
    setSendError(null);
    setRefreshWarning(null);
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
      setRefreshWarning(null);
    } catch (error) {
      setRefreshWarning(getInboxErrorMessage(error, 'Could not refresh messages'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleFileSelect = (file: File) => {

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
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();

    if ((!messageInput.trim() && !selectedFile) || !recipientAddress || sending)
      return;

    const replyTarget = replyingToMessage;
    const bodyText = messageInput.trim();
    const fileAttachment = selectedFile;

    setSending(true);
    setSendError(null);

    try {
      const formData = new FormData();
      for (const [field, value] of Object.entries(recipientAddress)) {
        formData.append(field, value);
      }
      if (phoneNumberId) {
        formData.append("phoneNumberId", phoneNumberId);
      }
      if (replyTarget?.id) {
        formData.append("contextMessageId", replyTarget.id);
      }
      if (bodyText) {
        formData.append("body", messageInput);
      }
      if (fileAttachment) {
        formData.append("file", fileAttachment);
      }

      const response = await fetch("/api/messages/send", {
        method: "POST",
        body: formData,
      });
      const data = await readInboxResponse<SendMessageResult>(response);

      setMessageInput("");
      setReplyingToMessage(null);
      handleRemoveFile();
      setIsNearBottom(true);

      const sentMessageId = extractSentMessageId(data);
      if (sentMessageId && replyTarget) {
        rememberLocalReplyContext(sentMessageId, replyTarget);
      }

      const refreshResults = await Promise.allSettled([
        refreshCurrentThread(),
        queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY }, { throwOnError: true }),
      ]);
      if (refreshResults.some(result => result.status === 'rejected')) {
        setRefreshWarning('Message sent. History could not be refreshed; refresh to see the latest messages.');
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setSendError(getInboxErrorMessage(error, "Failed to send message"));
    } finally {
      setSending(false);
      window.requestAnimationFrame(() => messageInputRef.current?.focus());
    }
  };

  const handleTemplateSent = async () => {
    setSendError(null);
    try {
      await refreshCurrentThread();
      await onTemplateSent?.();
    } catch {
      setRefreshWarning('Template sent. History could not be refreshed; refresh to see the latest messages.');
    }
  };

  const conversationStatus = conversations.find(conversation => conversation.id === conversationId)?.status;
  const nextStatus = conversationStatus === 'ended' ? 'active' : 'ended';
  const handleUpdateStatus = async () => {
    setIsUpdatingStatus(true);
    setStatusError(null);
    try {
      const result = await readInboxResponse<{ status: string }>(await fetch(`/api/conversations/${encodeURIComponent(conversationId!)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus, phoneNumberId }),
      }));
      const updatePage = (page: ConversationPage): ConversationPage => ({ ...page, data: page.data.map(conversation => conversation.id === conversationId ? { ...conversation, status: result.status } : conversation) });
      queryClient.setQueriesData<InfiniteData<ConversationPage> | ConversationPage>({ queryKey: CONVERSATIONS_QUERY_KEY }, data => {
        if (!data) return data;
        return 'pages' in data ? { ...data, pages: data.pages.map(updatePage) } : updatePage(data);
      });
      setShowStatusDialog(false);
      try { await queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY }, { throwOnError: true }); }
      catch { setRefreshWarning('Conversation updated. Refresh the list to confirm its latest state.'); }
    } catch (error) {
      setStatusError(getInboxErrorMessage(error, 'Could not update the conversation'));
    } finally { setIsUpdatingStatus(false); }
  };
  const handleJumpToConversation = (id: string) => {
    const viewport = getScrollViewport();
    const message = viewport?.querySelector<HTMLElement>(`[data-conversation-id="${CSS.escape(id)}"]`);
    if (message && viewport) { setIsNearBottom(false); viewport.scrollTo({ top: viewport.scrollTop + message.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 16, behavior: 'smooth' }); }
    else setRefreshWarning('Load older messages to view this conversation.');
    if (window.innerWidth < 768) setShowDetails(false);
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
          <div className="mx-auto w-full max-w-2xl space-y-3">
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
                    i % 2 === 0 ? "rounded-tr-none" : "rounded-tl-none",
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
        "relative flex min-h-0 min-w-0 flex-1 bg-[var(--chat-canvas)]",
        !isVisible && "hidden md:flex",
      )}
    >
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex min-h-14 items-center gap-3 border-b border-[var(--chat-border)] bg-[var(--chat-toolbar)] px-4 py-2 safe-area-top">
        {onBack && <Button onClick={onBack} type="button" variant="ghost" size="icon" className="size-9 shrink-0 md:hidden" aria-label="Back to conversations"><ArrowLeft className="size-4" /></Button>}
        <ContactAvatar label={contactLabel} className="hidden md:flex" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{contactLabel}</h2>
          <p className="truncate text-[11px] text-muted-foreground">{conversationStatus === 'ended' ? 'Closed' : conversationStatus === 'active' ? 'Active' : 'Conversation'}{lastSeenText ? ` · ${lastSeenText}` : ''}{displayPhoneNumber ? ` · ${displayPhoneNumber}` : username ? ` · @${username.replace(/^@/, '')}` : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button type="button" onClick={() => { setStatusError(null); setShowStatusDialog(true); }} variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground" disabled={isUpdatingStatus || !['active', 'ended'].includes(conversationStatus ?? '')} aria-label={nextStatus === 'ended' ? 'Close conversation' : 'Reopen conversation'} title={nextStatus === 'ended' ? 'Close conversation' : 'Reopen conversation'}>
            {isUpdatingStatus ? <Loader2 className="size-3.5 animate-spin" /> : nextStatus === 'ended' ? <CheckCircle2 className="size-3.5" /> : <RotateCcw className="size-3.5" />}<span className="hidden sm:inline">{nextStatus === 'ended' ? 'Close' : 'Reopen'}</span>
          </Button>
          <Button onClick={handleRefresh} disabled={refreshing} type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label="Refresh messages" title="Refresh messages"><RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} /></Button>
          <Button type="button" variant="ghost" size="icon" className={cn('size-8 text-muted-foreground', showDetails && 'bg-muted text-foreground')} onClick={() => setShowDetails(open => !open)} aria-label="Contact details" title="Contact details" aria-expanded={showDetails}><PanelRight className="size-3.5" /></Button>
        </div>
      </header>

      <ScrollArea
        ref={messagesContainerRef}
        className="h-0 flex-1 overscroll-contain px-3 py-4 sm:px-6"
      >
        <div className="mx-auto w-full max-w-2xl">
          {historyError && <p role="alert" className="mb-3 text-sm text-destructive">{getInboxErrorMessage(historyError, 'Could not load messages')}</p>}
          {refreshWarning && <p role="status" className="mb-3 text-sm text-muted-foreground">{refreshWarning}</p>}
          {hasNextPage && (
            <div className="mb-4 text-center">
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" disabled={isFetchingNextPage} onClick={async () => {
                setIsNearBottom(false);
                const viewport = getScrollViewport();
                const height = viewport?.scrollHeight ?? 0;
                const top = viewport?.scrollTop ?? 0;
                await fetchNextPage();
                window.requestAnimationFrame(() => {
                  if (viewport) viewport.scrollTop = top + viewport.scrollHeight - height;
                });
              }}>
                {isFetchingNextPage ? 'Loading history…' : 'Load older messages'}
              </Button>
            </div>
          )}
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
                  {showDateDivider && (
                    <div className="mb-2 flex justify-center py-2"><span className="rounded-full bg-muted/50 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground">{formatDateDivider(message.createdAt)}</span></div>
                  )}
                  {showConversationDivider && (
                    <div className="my-4 flex items-center gap-3 text-[11px] text-muted-foreground"><div className="h-px flex-1 bg-[var(--chat-border)]" /><span className="inline-flex shrink-0 items-center gap-1.5">{message.conversationId === conversationId && <span className="size-1.5 rounded-full bg-[var(--chat-presence)]" />}Conversation {shortConversationId(message.conversationId)}</span><div className="h-px flex-1 bg-[var(--chat-border)]" /></div>
                  )}

                  <div
                    className={cn(
                      "group flex mb-3 items-start gap-2 rounded-lg py-0.5 transition-colors",
                      message.direction === "outbound"
                        ? "justify-end"
                        : "justify-start",
                      isHighlighted && "bg-primary/10",
                    )}
                  >
                    {message.direction === 'inbound' && <ContactAvatar label={contactLabel} className="size-6" />}
                    {message.direction === "outbound" && canSendRegularMessage && (
                      <Button
                        type="button"
                        onClick={() => handleReplyToMessage(message)}
                        variant="ghost"
                        size="icon"
                        className="mt-1 size-7 flex-shrink-0 text-muted-foreground opacity-100 hover:bg-[var(--chat-hover)] sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                        aria-label="Reply to message"
                        title="Reply"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <div
                      className={cn(
                        "relative min-w-0 max-w-[85%] rounded-lg px-3 py-2 shadow-sm",
                        message.direction === "outbound"
                          ? "bg-[var(--chat-bubble-outgoing)] text-foreground rounded-tr-none"
                          : "bg-[var(--chat-bubble-incoming)] text-foreground rounded-tl-none",
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
                                getMessageSenderLabel(message.repliedTo, contactLabel, phoneNumber)}
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

                      <StructuredMessage message={message} />
                      {message.caption && (
                        <p className="text-sm break-words whitespace-pre-wrap mb-1"><WhatsappFormattedText text={message.caption} /></p>
                      )}

                      {displayMessageContent && (
                        <p className="text-sm break-words whitespace-pre-wrap"><WhatsappFormattedText text={displayMessageContent} /></p>
                      )}

                      {(message.origin === 'meta_business_agent' || message.origin === 'other_app' || message.passive) && (
                        <div className="mt-1 flex gap-2 text-[11px] text-muted-foreground">
                          {message.origin === 'meta_business_agent' ? 'Meta agent' : message.origin === 'other_app' ? 'Other app' : null}
                          {message.passive && <span title="A copy received while another application held control">Standby copy</span>}
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5">
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
                              Not delivered{message.deliveryError?.code ? ` (${message.deliveryError.code})` : ''}
                            </span>
                            {message.deliveryError && <p className="mt-1 text-xs text-destructive">{message.deliveryError.details || message.deliveryError.message || message.deliveryError.title}</p>}
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
                        className="mt-1 size-7 flex-shrink-0 text-muted-foreground opacity-100 hover:bg-[var(--chat-hover)] sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
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
        </div>
      </ScrollArea>

      {!isNearBottom && messages.length > 0 && <div className="pointer-events-none absolute bottom-32 left-0 right-0 flex justify-center"><Button type="button" variant="secondary" size="sm" className="pointer-events-auto gap-1 rounded-full border shadow-sm" onClick={() => { setIsNearBottom(true); scrollToBottom(); }}><ArrowDown className="size-3.5" />Latest messages</Button></div>}
      <div className="bg-[var(--chat-canvas)] px-3 pb-2.5 pt-2.5 safe-area-bottom">
        <div className="mx-auto w-full max-w-2xl">
          {sendError && <div role="alert" className="mb-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"><XCircle className="size-4 shrink-0" /><span className="flex-1">{sendError}</span><Button type="button" onClick={() => setSendError(null)} variant="ghost" size="icon" className="size-6" aria-label="Dismiss error"><X className="size-3" /></Button></div>}
          {canSendRegularMessage ? <MessageComposer
            value={messageInput} onChange={value => { setMessageInput(value); if (sendError) setSendError(null); }} inputRef={messageInputRef}
            onSubmit={handleSendMessage} sending={sending} canSend={!!recipientAddress && (!!messageInput.trim() || !!selectedFile)}
            selectedFile={selectedFile} filePreview={filePreview} onSelectFile={handleFileSelect} onRemoveFile={handleRemoveFile}
            reply={replyingToMessage} contactLabel={contactLabel} onCancelReply={handleCancelReply}
            onInteractive={() => setShowInteractiveDialog(true)} onTemplate={() => setShowTemplateDialog(true)}
          /> : <div className="flex items-start gap-3 rounded-lg border border-[var(--chat-warning-border)] bg-[var(--chat-warning-background)] p-3"><AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--chat-warning-foreground)]" /><div className="min-w-0 flex-1"><p className="mb-2 text-xs leading-5">{getDisabledInputMessage(messages, lastInboundAt)}</p><Button onClick={() => setShowTemplateDialog(true)} type="button" size="sm" className="h-8 gap-1.5 text-xs"><MessageSquare className="size-3.5" />Send template</Button></div></div>}
        </div>
      </div>
      </div>
      {showDetails && <ConversationDetails identity={identity} conversations={conversations} phoneNumberId={phoneNumberId} inboxPhoneNumber={inboxPhoneNumber} inboxDisplayName={inboxDisplayName} canReply={canSendRegularMessage} onClose={() => setShowDetails(false)} onJump={handleJumpToConversation} />}
      <Dialog open={showStatusDialog} onOpenChange={open => { if (!isUpdatingStatus) setShowStatusDialog(open); }}>
        <DialogContent><DialogHeader><DialogTitle>{nextStatus === 'ended' ? 'Close conversation?' : 'Reopen conversation?'}</DialogTitle><DialogDescription>{nextStatus === 'ended' ? 'Mark this conversation as closed in Kapso. You can reopen it later.' : 'Move this conversation back to the Active list in Kapso.'}</DialogDescription></DialogHeader>{statusError && <p role="alert" className="text-sm text-destructive">{statusError}</p>}<DialogFooter><Button type="button" variant="outline" disabled={isUpdatingStatus} onClick={() => setShowStatusDialog(false)}>Cancel</Button><Button type="button" variant={nextStatus === 'ended' ? 'destructive' : 'default'} disabled={isUpdatingStatus} onClick={handleUpdateStatus}>{isUpdatingStatus && <Loader2 className="mr-2 size-3.5 animate-spin" />}{nextStatus === 'ended' ? 'Close conversation' : 'Reopen conversation'}</Button></DialogFooter></DialogContent>
      </Dialog>
      <TemplateSelectorDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        identity={identity}
        phoneNumberId={phoneNumberId}
        onTemplateSent={handleTemplateSent}
      />

      <InteractiveMessageDialog
        open={showInteractiveDialog}
        onOpenChange={setShowInteractiveDialog}
        conversationId={conversationId}
        identity={identity}
        phoneNumberId={phoneNumberId}
        onMessageSent={async () => {
          try {
            await queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
            await refreshCurrentThread();
          } catch {
            setRefreshWarning('Interactive message sent. Refresh to see the latest history.');
          }
        }}
      />
    </div>
  );
}
