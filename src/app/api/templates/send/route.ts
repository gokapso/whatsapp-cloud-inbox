import { NextResponse } from 'next/server';
import { buildTemplateSendPayload } from '@kapso/whatsapp-cloud-api';
import { whatsappClient, PHONE_NUMBER_ID } from '@/lib/whatsapp-client';
import type { TemplateParameterInfo } from '@/types/whatsapp';

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

    // Convert parameters to the format expected by buildTemplateSendPayload
    let templateOptions: {
      name: string;
      language: string;
      body?: Array<{ type: string; text: string }>;
      header?: Array<{ type: string; text: string }>;
      buttons?: Array<{
        type: string;
        subType: string;
        index: number;
        parameters: Array<{ type: string; text: string }>;
      }>;
    } = {
      name: templateName,
      language: languageCode,
    };

    // If parameters are provided, structure them for the template
    if (parameters && parameterInfo) {
      const typedParamInfo = parameterInfo as TemplateParameterInfo;

      // Convert parameters to array format if it's an object
      const paramArray = Array.isArray(parameters)
        ? parameters
        : Object.values(parameters);

      // Split parameters by component (HEADER vs BODY vs BUTTON)
      const headerParams: string[] = [];
      const bodyParams: string[] = [];
      const buttonParamsMap: Map<number, string[]> = new Map();

      typedParamInfo.parameters.forEach((paramDef, index) => {
        const value = Array.isArray(parameters)
          ? parameters[index]
          : parameters[paramDef.name];

        if (paramDef.component === 'HEADER') {
          headerParams.push(String(value));
        } else if (paramDef.component === 'BODY') {
          bodyParams.push(String(value));
        } else if (paramDef.component === 'BUTTON' && paramDef.buttonIndex !== undefined) {
          if (!buttonParamsMap.has(paramDef.buttonIndex)) {
            buttonParamsMap.set(paramDef.buttonIndex, []);
          }
          buttonParamsMap.get(paramDef.buttonIndex)!.push(String(value));
        }
      });

      if (headerParams.length > 0) {
        templateOptions.header = headerParams.map(param => ({
          type: 'text',
          text: param
        }));
      }

      if (bodyParams.length > 0) {
        templateOptions.body = bodyParams.map(param => ({
          type: 'text',
          text: param
        }));
      }

      if (buttonParamsMap.size > 0) {
        templateOptions.buttons = [];
        buttonParamsMap.forEach((params, buttonIndex) => {
          templateOptions.buttons!.push({
            type: 'button',
            subType: 'url',
            index: buttonIndex,
            parameters: params.map(param => ({
              type: 'text',
              text: param
            }))
          });
        });
      }
    }

    // Build template payload
    const templatePayload = buildTemplateSendPayload(templateOptions);

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
