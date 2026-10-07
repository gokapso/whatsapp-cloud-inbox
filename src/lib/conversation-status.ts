import { InboxInputError, readInboxResponse } from "./inbox-errors";

export function validateConversationStatusInput(body: unknown): {
  status: "active" | "ended";
  phoneNumberId: string;
} {
  if (!body || typeof body !== "object")
    throw new InboxInputError("A conversation status is required");
  const input = body as Record<string, unknown>;
  if (input.status !== "active" && input.status !== "ended")
    throw new InboxInputError("Status must be active or ended");
  if (typeof input.phoneNumberId !== "string" || !input.phoneNumberId.trim())
    throw new InboxInputError("A business phone number is required");
  return { status: input.status, phoneNumberId: input.phoneNumberId.trim() };
}

export function assertConversationNumber(
  actualPhoneNumberId: unknown,
  selectedPhoneNumberId: string,
) {
  if (actualPhoneNumberId !== selectedPhoneNumberId)
    throw new InboxInputError(
      "Conversation does not belong to the selected business number",
    );
}

type PlatformConversation = {
  id: string;
  phone_number_id: string;
  status: string;
};

export async function updatePlatformConversationStatus(
  {
    url,
    apiKey,
    phoneNumberId,
    status,
  }: {
    url: string;
    apiKey: string;
    phoneNumberId: string;
    status: "active" | "ended";
  },
  request: typeof fetch = fetch,
) {
  const headers = { "X-API-Key": apiKey, "Content-Type": "application/json" };
  const conversation = await readInboxResponse<{ data: PlatformConversation }>(
    await request(url, { headers, cache: "no-store" }),
  );
  assertConversationNumber(conversation.data.phone_number_id, phoneNumberId);
  const updated = await readInboxResponse<{ data: PlatformConversation }>(
    await request(url, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ whatsapp_conversation: { status } }),
    }),
  );
  return { id: updated.data.id, status: updated.data.status };
}
