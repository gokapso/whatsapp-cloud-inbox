"use client";

import { useEffect } from "react";
import { format, isValid } from "date-fns";
import { X } from "lucide-react";
import { ContactAvatar } from "@/components/contact-avatar";
import { Button } from "@/components/ui/button";
import {
  getIdentityLabel,
  type WhatsappIdentity,
} from "@/lib/whatsapp-identity";
import { shortConversationId, type Conversation } from "@/lib/inbox-data";

type Props = {
  identity: WhatsappIdentity;
  conversations: Conversation[];
  phoneNumberId?: string;
  inboxPhoneNumber?: string;
  inboxDisplayName?: string;
  canReply: boolean;
  onClose: () => void;
  onJump: (conversationId: string) => void;
};

export function ConversationDetails({
  identity,
  conversations,
  phoneNumberId,
  inboxPhoneNumber,
  inboxDisplayName,
  canReply,
  onClose,
  onJump,
}: Props) {
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  const label = getIdentityLabel(identity);
  const fields = [
    ["Phone", identity.phoneNumber],
    [
      "Username",
      identity.username ? `@${identity.username.replace(/^@/, "")}` : undefined,
    ],
    ["Business-scoped user ID", identity.businessScopedUserId],
    ["Parent business-scoped user ID", identity.parentBusinessScopedUserId],
    ["Business number", inboxPhoneNumber],
    ["Number name", inboxDisplayName],
    ["Phone number ID", phoneNumberId],
  ];
  return (
    <aside
      aria-label="Contact details"
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-80 shrink-0 flex-col border-l border-[var(--chat-border)] bg-[var(--chat-canvas)] shadow-lg lg:static lg:w-72 lg:shadow-none"
    >
      <div className="flex h-14 items-center justify-between border-b px-4">
        <h3 className="text-sm font-semibold">Contact details</h3>
        <Button
          autoFocus
          onClick={onClose}
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Close contact details"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-5 flex items-center gap-3">
          <ContactAvatar label={label} className="size-10" />
          <p className="min-w-0 truncate text-sm font-semibold">{label}</p>
        </div>
        <dl className="space-y-4">
          {fields
            .filter(([, value]) => value)
            .map(([name, value]) => (
              <div key={name}>
                <dt className="mb-1 text-[11px] text-muted-foreground">
                  {name}
                </dt>
                <dd className="break-words text-xs select-text">{value}</dd>
              </div>
            ))}
        </dl>
        <div className="my-5 border-t pt-4">
          <p className="mb-1 text-xs font-medium">WhatsApp reply window</p>
          <p className="text-xs leading-5 text-muted-foreground">
            {canReply
              ? "Open · free-form replies are available."
              : "Closed · send an approved template to start a conversation."}
          </p>
        </div>
        <div className="border-t pt-4">
          <h4 className="mb-2 text-xs font-medium">
            Conversation history{" "}
            <span className="text-muted-foreground">
              ({conversations.length})
            </span>
          </h4>
          <div className="space-y-1">
            {conversations.map((conversation) => {
              const date = conversation.lastActiveAt
                ? new Date(conversation.lastActiveAt)
                : undefined;
              return (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onJump(conversation.id)}
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <div>
                    <p>
                      {date && isValid(date)
                        ? format(date, "MMM d, yyyy")
                        : "Conversation"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {shortConversationId(conversation.id)}
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {conversation.status === "ended"
                      ? "Closed"
                      : conversation.status}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </aside>
  );
}
