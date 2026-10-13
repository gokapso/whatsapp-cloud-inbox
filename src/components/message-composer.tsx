"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import Image from "next/image";
import {
  ArrowUp,
  Bold,
  Code2,
  Italic,
  ListTree,
  Loader2,
  MessageSquare,
  Paperclip,
  Reply,
  Strikethrough,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { getReplyPreviewContent, type Message } from "@/lib/inbox-data";
import { toggleComposerFormat } from "@/lib/composer-formatting";
import type { WhatsappTextFormat } from "@/lib/whatsapp-text-formatter";

const FORMATS = [
  { format: "bold", label: "Bold", icon: Bold },
  { format: "italic", label: "Italic", icon: Italic },
  { format: "strikethrough", label: "Strikethrough", icon: Strikethrough },
  { format: "code", label: "Code", icon: Code2 },
] as const;

type Props = {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onSubmit: (event: FormEvent) => void;
  sending: boolean;
  canSend: boolean;
  selectedFile: File | null;
  filePreview: string | null;
  onSelectFile: (file: File) => void;
  onRemoveFile: () => void;
  reply: Message | null;
  contactLabel: string;
  onCancelReply: () => void;
  onInteractive: () => void;
  onTemplate: () => void;
};

export function MessageComposer(props: Props) {
  const {
    value,
    onChange,
    inputRef,
    sending,
    selectedFile,
    filePreview,
    reply,
  } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${Math.min(144, Math.max(44, input.scrollHeight))}px`;
  }, [value, inputRef]);

  function applyFormat(format: WhatsappTextFormat) {
    const input = inputRef.current;
    if (!input) return;
    const result = toggleComposerFormat(
      value,
      input.selectionStart,
      input.selectionEnd,
      format,
    );
    onChange(result.value);
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(result.from, result.to);
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={props.onSubmit}
      className={cn(
        "rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-surface)] shadow-sm focus-within:ring-1 focus-within:ring-ring/40",
        isDragging && "ring-2 ring-primary",
      )}
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files") || sending) return;
        event.preventDefault();
        dragDepth.current++;
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setIsDragging(false);
        const file = event.dataTransfer.files[0];
        if (file && !sending) props.onSelectFile(file);
      }}
    >
      {reply && (
        <div className="m-2 flex items-center gap-2 rounded border-l-2 border-primary bg-muted/50 px-2 py-1.5">
          <Reply className="size-3.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-medium">
              Replying to{" "}
              {reply.direction === "outbound" ? "you" : props.contactLabel}
            </p>
            <p className="truncate text-muted-foreground">
              {getReplyPreviewContent(reply)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Cancel reply"
            disabled={sending}
            onClick={props.onCancelReply}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
      {selectedFile && (
        <div className="m-2 flex items-center gap-2 rounded bg-muted/50 p-2">
          {filePreview ? (
            <Image
              src={filePreview}
              width={40}
              height={40}
              unoptimized
              alt="Attachment preview"
              className="size-10 rounded object-cover"
            />
          ) : (
            <Paperclip className="size-5 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-medium">{selectedFile.name}</p>
            <p className="text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Remove selected file"
            onClick={props.onRemoveFile}
            disabled={sending}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}
      <Textarea
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          isDragging
            ? "Drop a file to attach it"
            : selectedFile
              ? "Add a caption…"
              : "Type your message…"
        }
        aria-label="Message"
        disabled={sending}
        rows={1}
        className="min-h-11 max-h-36 resize-none rounded-none border-0 bg-transparent px-3 py-2.5 text-base shadow-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent md:text-sm"
        onPaste={(event) => {
          const file = event.clipboardData.files[0];
          if (file) {
            event.preventDefault();
            props.onSelectFile(file);
          }
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (props.canSend && !sending) formRef.current?.requestSubmit();
          }
          if (event.ctrlKey || event.metaKey) {
            const format =
              event.key.toLowerCase() === "b"
                ? "bold"
                : event.key.toLowerCase() === "i"
                  ? "italic"
                  : undefined;
            if (format) {
              event.preventDefault();
              applyFormat(format);
            }
          }
        }}
      />
      <div className="flex items-center justify-between gap-1 px-2 pb-2">
        <div className="flex items-center gap-0">
          {FORMATS.map(({ format, label, icon: Icon }) => (
            <Button
              key={format}
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground sm:size-7"
              disabled={sending}
              aria-label={label}
              title={label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => applyFormat(format)}
            >
              <Icon className="size-3.5" strokeWidth={1.5} />
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground sm:size-7"
            aria-label="Upload file"
            title="Attach file"
            disabled={sending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="size-3.5" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) props.onSelectFile(file);
              event.target.value = "";
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground sm:size-7"
            aria-label="Send template"
            title="Send template"
            disabled={sending}
            onClick={props.onTemplate}
          >
            <MessageSquare className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground sm:size-7"
            aria-label="Send interactive message"
            title="Send interactive message"
            disabled={sending}
            onClick={props.onInteractive}
          >
            <ListTree className="size-3.5" />
          </Button>
          <Button
            type="submit"
            size="icon"
            className="size-8 rounded-md bg-[var(--chat-send)] text-white hover:bg-[var(--chat-send-hover)]"
            disabled={sending || !props.canSend}
            aria-label={sending ? "Sending message" : "Send message"}
            title="Send message (Enter). Shift+Enter for a new line."
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
