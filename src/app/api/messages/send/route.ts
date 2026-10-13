import { readRecipientAddress } from '@/lib/message-recipient';
import { NextResponse } from 'next/server';
import { configurationErrorResponse, resolvePhoneNumberContext } from '@/lib/inbox-settings';
import { whatsappClient } from '@/lib/whatsapp-client';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const recipientAddress = readRecipientAddress({ to: formData.get('to'), recipient: formData.get('recipient') });
    const body = formData.get('body') as string;
    const file = formData.get('file') as File | null;
    const contextMessageId = (formData.get('contextMessageId') as string | null)?.trim() || undefined;
    const configuredPhoneNumber = await resolvePhoneNumberContext(formData.get('phoneNumberId') as string | undefined);
    const phoneNumberId = configuredPhoneNumber.phone_number_id;

    let result;

    // Send media message
    if (file) {
      const fileType = file.type.split('/')[0]; // image, video, audio, application
      const mediaType = fileType === 'application' ? 'document' : fileType;

      // Upload media first
      const uploadResult = await whatsappClient.media.upload({
        phoneNumberId,
        type: mediaType as 'image' | 'video' | 'audio' | 'document',
        file: file,
        fileName: file.name
      });

      // Send message with media
      if (mediaType === 'image') {
        result = await whatsappClient.messages.sendImage({
          phoneNumberId,
          ...recipientAddress,
          contextMessageId,
          image: { id: uploadResult.id, caption: body || undefined }
        });
      } else if (mediaType === 'video') {
        result = await whatsappClient.messages.sendVideo({
          phoneNumberId,
          ...recipientAddress,
          contextMessageId,
          video: { id: uploadResult.id, caption: body || undefined }
        });
      } else if (mediaType === 'audio') {
        result = await whatsappClient.messages.sendAudio({
          phoneNumberId,
          ...recipientAddress,
          contextMessageId,
          audio: { id: uploadResult.id }
        });
      } else {
        result = await whatsappClient.messages.sendDocument({
          phoneNumberId,
          ...recipientAddress,
          contextMessageId,
          document: { id: uploadResult.id, caption: body || undefined, filename: file.name }
        });
      }
    } else if (body) {
      // Send text message
      result = await whatsappClient.messages.sendText({
        phoneNumberId,
        ...recipientAddress,
        contextMessageId,
        body
      });
    } else {
      return NextResponse.json(
        { error: 'Either body or file is required' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      typeof result === 'object' && result !== null
        ? { ...result, contextMessageId }
        : { result, contextMessageId }
    );
  } catch (error) {
    console.error('Error sending message:', error);
    return configurationErrorResponse(error);
  }
}
