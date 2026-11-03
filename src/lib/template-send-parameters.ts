import type { TemplateParameterInfo, TemplateParameters } from '@/types/whatsapp';

type TextParameter = { type: 'text'; text: string; parameterName?: string };

export type TextTemplateParameters = {
  header?: TextParameter;
  body?: TextParameter[];
  buttons?: Array<{
    type: 'button';
    subType: 'url';
    index: number;
    parameters: TextParameter[];
  }>;
};

export function buildTextTemplateParameters(
  parameters: TemplateParameters,
  parameterInfo: TemplateParameterInfo
): TextTemplateParameters {
  const body: TextParameter[] = [];
  const buttons: NonNullable<TextTemplateParameters['buttons']> = [];
  let header: TextParameter | undefined;

  const getParameterValue = (paramName: string, index: number) => {
    if (Array.isArray(parameters)) {
      return parameters[index];
    }
    return parameters[paramName];
  };

  const textParameter = (text: string, name: string): TextParameter => {
    // SDK 0.4.0 sends parameterName as parameter_name. Meta accepts that only for named templates.
    if (parameterInfo.format === 'NAMED') {
      return { type: 'text', text, parameterName: name };
    }
    return { type: 'text', text };
  };

  parameterInfo.parameters.forEach((paramDef, index) => {
    const rawValue = getParameterValue(paramDef.name, index);
    if (rawValue === undefined || rawValue === null) {
      return;
    }

    const textValue = String(rawValue);
    if (!textValue.trim()) {
      return;
    }

    if (paramDef.component === 'HEADER') {
      if (!header) {
        header = textParameter(textValue, paramDef.name);
      }
      return;
    }

    if (paramDef.component === 'BODY') {
      body.push(textParameter(textValue, paramDef.name));
      return;
    }

    if (paramDef.component === 'BUTTON' && typeof paramDef.buttonIndex === 'number') {
      let button = buttons.find((btn) => btn.index === paramDef.buttonIndex);
      if (!button) {
        button = {
          type: 'button',
          subType: 'url',
          index: paramDef.buttonIndex,
          parameters: []
        };
        buttons.push(button);
      }

      button.parameters.push(textParameter(textValue, paramDef.name));
    }
  });

  return {
    ...(header ? { header } : {}),
    ...(body.length > 0 ? { body } : {}),
    ...(buttons.length > 0 ? { buttons } : {})
  };
}
