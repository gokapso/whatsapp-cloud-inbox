"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateSelectorDialog } from "@/components/template-selector-dialog";
import { getInboxErrorMessage, readInboxResponse } from "@/lib/inbox-errors";
import { readRecipientAddress } from "@/lib/message-recipient";
import type { WhatsappIdentity } from "@/lib/whatsapp-identity";
import type { InboxSettingsResponse } from "@/types/settings";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
};

export function NewConversationDialog({ open, onOpenChange, onSent }: Props) {
  const [recipientType, setRecipientType] = useState<"phone" | "bsuid">(
    "phone",
  );
  const [recipient, setRecipient] = useState("");
  const [selectedNumberId, setSelectedNumberId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{
    identity: WhatsappIdentity;
    phoneNumberId: string;
  } | null>(null);
  const settings = useQuery({
    queryKey: ["inbox-settings"],
    queryFn: async () =>
      readInboxResponse<InboxSettingsResponse>(await fetch("/api/settings")),
    enabled: open,
  });
  const numbers =
    settings.data?.phoneNumbers.filter((number) =>
      settings.data!.selectedPhoneNumberIds.includes(number.phone_number_id),
    ) ?? [];
  const phoneNumberId = numbers.some(
    (number) => number.phone_number_id === selectedNumberId,
  )
    ? selectedNumberId
    : (settings.data?.defaultPhoneNumberId ?? numbers[0]?.phone_number_id);

  function handleContinue(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (!phoneNumberId)
        throw new Error("Select a business number in Inbox settings first.");
      const value = recipient.trim();
      if (recipientType === "phone" && !/^\+?[1-9]\d{5,14}$/.test(value))
        throw new Error(
          "Enter an international phone number, including country code.",
        );
      const address = readRecipientAddress(
        recipientType === "phone"
          ? { to: value.replace(/^\+/, "") }
          : { recipient: value },
      );
      setTarget({
        identity:
          "to" in address
            ? { phoneNumber: address.to }
            : { businessScopedUserId: address.recipient },
        phoneNumberId,
      });
    } catch (error) {
      setError(getInboxErrorMessage(error, "Check the recipient"));
    }
  }

  function close() {
    setTarget(null);
    onOpenChange(false);
  }

  return (
    <>
      {!target && (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New conversation</DialogTitle>
              <DialogDescription>
                Start with an approved WhatsApp template. Once the contact
                replies, you can send regular messages.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleContinue} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="new-conversation-number">Business number</Label>
                <select
                  id="new-conversation-number"
                  value={phoneNumberId ?? ""}
                  onChange={(event) => setSelectedNumberId(event.target.value)}
                  disabled={settings.isPending || !numbers.length}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {numbers.map((number) => (
                    <option
                      key={number.phone_number_id}
                      value={number.phone_number_id}
                    >
                      {number.display_name ||
                        number.verified_name ||
                        number.display_phone_number ||
                        number.phone_number_id}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-conversation-recipient-type">
                  Recipient type
                </Label>
                <select
                  id="new-conversation-recipient-type"
                  value={recipientType}
                  onChange={(event) => {
                    setRecipientType(event.target.value as "phone" | "bsuid");
                    setRecipient("");
                    setError(null);
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="phone">Phone number</option>
                  <option value="bsuid">Business-scoped user ID (BSUID)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-conversation-recipient">
                  {recipientType === "phone" ? "Phone number" : "BSUID"}
                </Label>
                <Input
                  id="new-conversation-recipient"
                  autoFocus
                  value={recipient}
                  onChange={(event) => setRecipient(event.target.value)}
                  placeholder={
                    recipientType === "phone"
                      ? "+14155550123"
                      : "WhatsApp business-scoped user ID"
                  }
                  inputMode={recipientType === "phone" ? "tel" : "text"}
                  required
                />
              </div>
              {(error || settings.error) && (
                <p role="alert" className="text-sm text-destructive">
                  {error ||
                    getInboxErrorMessage(
                      settings.error,
                      "Could not load business numbers",
                    )}
                </p>
              )}
              {!settings.isPending && !numbers.length && !settings.error && (
                <p className="text-xs text-muted-foreground">
                  Choose a connected business number in Inbox settings.
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!recipient.trim() || !numbers.length}
                >
                  Choose template
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      {target && (
        <TemplateSelectorDialog
          open={open}
          onOpenChange={(next) => {
            if (!next) close();
          }}
          identity={target.identity}
          phoneNumberId={target.phoneNumberId}
          onTemplateSent={() => {
            close();
            setRecipient("");
            onSent();
          }}
        />
      )}
    </>
  );
}
