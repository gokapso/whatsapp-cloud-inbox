import { NextResponse } from 'next/server';
import { buildTemplateSendPayload } from '@kapso/whatsapp-cloud-api';
import { configurationErrorResponse, resolvePhoneNumberContext } from '@/lib/inbox-settings';
import { buildTextTemplateParameters } from '@/lib/template-send-parameters';
import { whatsappClient } from '@/lib/whatsapp-client';
import type { TemplateParameterInfo } from '@/types/whatsapp';

type TemplateSendInput = Parameters<typeof buildTemplateSendPayload>[0];
type TemplateMessageInput = Parameters<(typeof whatsappClient.messages)['sendTemplate']>[0];
type TemplatePayload = TemplateMessageInput['template'];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, templateName, languageCode, parameters, parameterInfo, phoneNumberId: requestedPhoneNumberId } = body;
    const phoneNumber = await resolvePhoneNumberContext(requestedPhoneNumberId);
    const phoneNumberId = phoneNumber.phone_number_id;

    if (!to || !templateName || !languageCode) {
      return NextResponse.json(
        { error: 'Missing required fields: to, templateName, languageCode' },
        { status: 400 }
      );
    }

    const templateOptions: TemplateSendInput = {
      name: templateName,
      language: languageCode
    };

    if (parameters && parameterInfo) {
      const textParameters = buildTextTemplateParameters(parameters, parameterInfo as TemplateParameterInfo);
      if (textParameters.header) {
        templateOptions.header = textParameters.header;
      }
      if (textParameters.body) {
        templateOptions.body = textParameters.body;
      }
      if (textParameters.buttons) {
        templateOptions.buttons = textParameters.buttons;
      }
    }

    const templatePayload = buildTemplateSendPayload(templateOptions) as TemplatePayload;

    // Send template message
    const result = await whatsappClient.messages.sendTemplate({
      phoneNumberId,
      to,
      template: templatePayload
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending template:', error);
    return configurationErrorResponse(error);
  }
}
