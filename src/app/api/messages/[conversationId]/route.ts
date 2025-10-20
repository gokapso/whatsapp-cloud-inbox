import { NextResponse } from 'next/server';
import { buildKapsoFields } from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const { conversationId } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const response = await whatsappClient.messages.listByConversation({
      phoneNumberId: PHONE_NUMBER_ID,
      conversationId,
      limit,
      fields: buildKapsoFields([
        'direction',
        'status',
        'processing_status',
        'phone_number',
        'has_media',
        'media_data',
        'media_url',
        'whatsapp_conversation_id',
        'contact_name',
        'message_type_data',
        'content',
        'flow_response',
        'flow_token',
        'flow_name',
        'order_text'
      ])
    });

    // Transform messages to match frontend expectations
    const transformedData = response.data.map((msg: any) => {
      const mediaId = msg.image?.id || msg.video?.id || msg.audio?.id || msg.document?.id || msg.sticker?.id;
      const hasMedia = !!mediaId || ['image', 'video', 'audio', 'document', 'sticker'].includes(msg.type);

      // Priority: Meta-standard link → Kapso mediaUrl → legacy mediaData.url
      const mediaUrl = msg.image?.link || msg.video?.link || msg.audio?.link || msg.document?.link ||
                       msg.sticker?.link || msg.kapso?.mediaUrl || msg.kapso?.mediaData?.url;

      const mediaData = mediaUrl ? {
        url: mediaUrl,
        filename: msg.document?.filename || msg.kapso?.messageTypeData?.filename || msg.kapso?.mediaData?.filename,
        contentType: msg.kapso?.messageTypeData?.mimeType || msg.kapso?.mediaData?.contentType,
        byteSize: msg.kapso?.mediaData?.byteSize
      } : undefined;

      return {
        id: msg.id,
        direction: msg.kapso?.direction || 'inbound',
        content: msg.kapso?.content || msg.text?.body || msg.caption || msg.reaction?.emoji || '',
        createdAt: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
        status: msg.kapso?.status,
        phoneNumber: msg.kapso?.phoneNumber || msg.from,
        hasMedia,
        mediaData,
        reactionEmoji: msg.reaction?.emoji,
        reactedToMessageId: msg.reaction?.messageId || msg.kapso?.messageTypeData?.messageId,
        filename: msg.document?.filename || msg.kapso?.messageTypeData?.filename,
        mimeType: msg.kapso?.messageTypeData?.mimeType,
        messageType: msg.type,
        caption: msg.image?.caption || msg.video?.caption || msg.document?.caption,
        metadata: {
          mediaId
        }
      };
    });

    return NextResponse.json({
      data: transformedData,
      paging: response.paging
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}
