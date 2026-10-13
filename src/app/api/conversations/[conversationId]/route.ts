import {
  configurationErrorResponse,
  getKapsoApiKey,
  platformApiUrl,
  resolvePhoneNumberContext,
} from "@/lib/inbox-settings";
import { InboxInputError } from "@/lib/inbox-errors";
import {
  updatePlatformConversationStatus,
  validateConversationStatusInput,
} from "@/lib/conversation-status";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const body = await request.json().catch(() => {
      throw new InboxInputError("Invalid JSON");
    });
    const { status, phoneNumberId } = validateConversationStatusInput(body);
    const phoneNumber = await resolvePhoneNumberContext(phoneNumberId);
    const url = platformApiUrl(
      `/whatsapp/conversations/${encodeURIComponent(conversationId)}`,
    );
    const updated = await updatePlatformConversationStatus({
      url,
      apiKey: getKapsoApiKey(),
      phoneNumberId: phoneNumber.phone_number_id,
      status,
    });
    return Response.json(updated);
  } catch (error) {
    return configurationErrorResponse(error);
  }
}
