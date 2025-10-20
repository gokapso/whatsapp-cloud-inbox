import type {
  Template,
  TemplateComponent,
  TemplateParameterInfo,
  ParameterFormat,
} from '@/types/whatsapp';

/**
 * Extracts parameter information from a WhatsApp template
 */
export function getTemplateParameters(template: Template): TemplateParameterInfo {
  const parameters: TemplateParameterInfo['parameters'] = [];
  let format: ParameterFormat = 'POSITIONAL';

  if (!template.components) {
    return { format, parameters };
  }

  // Check each component for parameters
  for (const component of template.components) {
    if (component.type === 'HEADER' && component.format === 'TEXT') {
      const headerParams = extractHeaderParameters(component);
      if (headerParams.length > 0) {
        parameters.push(...headerParams.map(p => ({ ...p, component: 'HEADER' as const })));
        if (component.example?.headerTextNamedParams) {
          format = 'NAMED';
        }
      }
    }

    if (component.type === 'BODY') {
      const bodyParams = extractBodyParameters(component);
      if (bodyParams.length > 0) {
        parameters.push(...bodyParams.map(p => ({ ...p, component: 'BODY' as const })));
        if (component.example?.bodyTextNamedParams) {
          format = 'NAMED';
        }
      }
    }

    if (component.type === 'BUTTONS') {
      const buttonParams = extractButtonParameters(component);
      if (buttonParams.length > 0) {
        parameters.push(...buttonParams.map(p => ({ ...p, component: 'BUTTON' as const })));
      }
    }
  }

  return { format, parameters };
}

/**
 * Extracts parameters from HEADER component
 */
function extractHeaderParameters(component: TemplateComponent): Array<{ name: string; example?: string }> {
  const params: Array<{ name: string; example?: string }> = [];

  if (!component.example) {
    return params;
  }

  // Named parameters
  if (component.example.headerTextNamedParams) {
    return component.example.headerTextNamedParams.map(p => ({
      name: p.paramName,
      example: p.example,
    }));
  }

  // Positional parameters
  if (component.example.headerText) {
    return component.example.headerText.map((example, index) => ({
      name: `header_param_${index + 1}`,
      example,
    }));
  }

  return params;
}

/**
 * Extracts parameters from BODY component
 */
function extractBodyParameters(component: TemplateComponent): Array<{ name: string; example?: string }> {
  const params: Array<{ name: string; example?: string }> = [];

  if (!component.example) {
    return params;
  }

  // Named parameters
  if (component.example.bodyTextNamedParams) {
    return component.example.bodyTextNamedParams.map(p => ({
      name: p.paramName,
      example: p.example,
    }));
  }

  // Positional parameters (bodyText is 2D array)
  if (component.example.bodyText && component.example.bodyText.length > 0) {
    const firstExample = component.example.bodyText[0];
    return firstExample.map((example, index) => ({
      name: `body_param_${index + 1}`,
      example,
    }));
  }

  return params;
}

/**
 * Extracts parameters from BUTTONS component
 */
function extractButtonParameters(component: TemplateComponent): Array<{ name: string; example?: string; buttonIndex: number }> {
  const params: Array<{ name: string; example?: string; buttonIndex: number }> = [];

  if (!component.buttons) {
    return params;
  }

  // Button parameters are always positional
  component.buttons.forEach((button, buttonIndex) => {
    if (button.example && button.example.length > 0) {
      button.example.forEach((exampleValue, paramIndex) => {
        params.push({
          name: `button_${buttonIndex}_param_${paramIndex + 1}`,
          example: exampleValue,
          buttonIndex,
        });
      });
    }
  });

  return params;
}

/**
 * Converts user input to the appropriate format for the template
 */
export function formatParametersForTemplate(
  parameterInfo: TemplateParameterInfo,
  values: Record<string, string>
): string[] | Record<string, string> {
  if (parameterInfo.format === 'NAMED') {
    // Return as object with parameter names as keys
    return values;
  }

  // Return as array in the order parameters appear
  return parameterInfo.parameters.map(param => values[param.name] || '');
}

/**
 * Checks if a template requires parameters
 */
export function templateHasParameters(template: Template): boolean {
  const paramInfo = getTemplateParameters(template);
  return paramInfo.parameters.length > 0;
}
