import { NextResponse } from 'next/server';
import { whatsappClient } from '@/lib/whatsapp-client';
import type { TemplateParameterInfo } from '@/types/whatsapp';

// Previous Kapso template helper kept for reference.
//
// import { buildTemplateSendPayload } from '@kapso/whatsapp-cloud-api';
// import { PHONE_NUMBER_ID } from '@/lib/whatsapp-client';

type TemplatePayload = {
  name: string;
  language: { code: string };
  components?: Array<{
    type: string;
    parameters?: Array<{ type: 'text'; text: string; parameter_name?: string }>;
  }>;
};

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

    const templatePayload: TemplatePayload = {
      name: templateName,
      language: {
        code: languageCode
      }
    };

    if (parameters && parameterInfo) {
      const typedParamInfo = parameterInfo as TemplateParameterInfo;
      const components: NonNullable<TemplatePayload['components']> = [];

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

        components.push({
          type: paramDef.component.toLowerCase(),
          parameters: [{ type: 'text', text: textValue, parameter_name: paramDef.name }]
        });
      });

      if (components.length > 0) {
        templatePayload.components = components;
      }
    }

    const result = await whatsappClient.messages.sendTemplate({
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
