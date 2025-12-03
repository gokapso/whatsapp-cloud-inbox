import { NextResponse } from 'next/server';
import { buildTemplateSendPayload } from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';
import type { TemplateParameterInfo } from '@/types/whatsapp';

type TemplateSendInput = Parameters<typeof buildTemplateSendPayload>[0];
type TemplateMessageInput = Parameters<(typeof whatsappClient.messages)['sendTemplate']>[0];
type TemplatePayload = TemplateMessageInput['template'];
type TemplateBodyParameter = NonNullable<TemplateSendInput['body']>[number];
type TemplateHeaderParameter = Extract<NonNullable<TemplateSendInput['header']>, { type: 'text' }>;
type TemplateButtonParameter = Extract<NonNullable<TemplateSendInput['buttons']>[number], { subType: 'url' }>;
type ButtonTextParameter = { type: 'text'; text: string; parameter_name?: string };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, templateName, languageCode, parameters, parameterInfo } = body;

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
      const typedParamInfo = parameterInfo as TemplateParameterInfo;

      const bodyParameters: TemplateBodyParameter[] = [];
      const buttonParameters: TemplateButtonParameter[] = [];
      let headerParameter: TemplateHeaderParameter | undefined;

      const getParameterValue = (paramName: string, index: number) => {
        if (Array.isArray(parameters)) {
          return parameters[index];
        }
        return parameters[paramName];
      };

      typedParamInfo.parameters.forEach((paramDef, index) => {
        const rawValue = getParameterValue(paramDef.name, index);
        if (rawValue === undefined || rawValue === null) {
          return;
        }

        const textValue = String(rawValue);
        if (!textValue.trim()) {
          return;
        }

        if (paramDef.component === 'HEADER') {
          if (!headerParameter) {
            headerParameter = {
              type: 'text',
              text: textValue,
              parameter_name: paramDef.name
            } as TemplateHeaderParameter;
          }
          return;
        }

        if (paramDef.component === 'BODY') {
          bodyParameters.push({
            type: 'text',
            text: textValue,
            parameter_name: paramDef.name
          } as TemplateBodyParameter);
          return;
        }

        if (paramDef.component === 'BUTTON' && typeof paramDef.buttonIndex === 'number') {
          let button = buttonParameters.find((btn) => btn.index === paramDef.buttonIndex);
          if (!button) {
            button = {
              type: 'button',
              subType: 'url',
              index: paramDef.buttonIndex,
              parameters: []
            } as TemplateButtonParameter;
            buttonParameters.push(button);
          }

          button.parameters.push({
            type: 'text',
            text: textValue,
            parameter_name: paramDef.name
          } as ButtonTextParameter);
        }
      });

      if (headerParameter) {
        templateOptions.header = headerParameter;
      }

      if (bodyParameters.length > 0) {
        templateOptions.body = bodyParameters;
      }

      if (buttonParameters.length > 0) {
        templateOptions.buttons = buttonParameters;
      }
    }

    const templatePayload = buildTemplateSendPayload(templateOptions) as TemplatePayload;

    // Send template message
    const result = await whatsappClient.messages.sendTemplate({
      phoneNumberId: PHONE_NUMBER_ID,
      to,
      template: templatePayload
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error sending template:', error);
    return NextResponse.json(
      { error: 'Failed to send template message' },
      { status: 500 }
    );
  }
}
