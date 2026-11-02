import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTemplateSendPayload } from '@kapso/whatsapp-cloud-api';
import { buildTextTemplateParameters } from '../src/lib/template-send-parameters.ts';

const payloadFor = (parameters, parameterInfo) => buildTemplateSendPayload({
  name: 'hello',
  language: 'en_US',
  ...buildTextTemplateParameters(parameters, parameterInfo)
});

const parameterTexts = (payload) => payload.components.flatMap(component => component.parameters ?? []);

test('positional templates send ordered text parameters without parameter_name', () => {
  const payload = payloadFor(['100', 'Ada', 'SAVE'], {
    format: 'POSITIONAL',
    parameters: [
      { name: 'header_param_1', component: 'HEADER' },
      { name: 'body_param_1', component: 'BODY' },
      { name: 'button_0_param_1', component: 'BUTTON', buttonIndex: 0 }
    ]
  });

  assert.deepEqual(parameterTexts(payload), [
    { type: 'text', text: '100' },
    { type: 'text', text: 'Ada' },
    { type: 'text', text: 'SAVE' }
  ]);
  assert.equal(JSON.stringify(payload).includes('parameter_name'), false);
});

test('named templates keep parameter_name for header, body, and url buttons', () => {
  const payload = payloadFor(
    { order_id: '100', first_name: 'Ada', promo: 'SAVE' },
    {
      format: 'NAMED',
      parameters: [
        { name: 'order_id', component: 'HEADER' },
        { name: 'first_name', component: 'BODY' },
        { name: 'promo', component: 'BUTTON', buttonIndex: 0 }
      ]
    }
  );

  assert.deepEqual(parameterTexts(payload), [
    { type: 'text', text: '100', parameter_name: 'order_id' },
    { type: 'text', text: 'Ada', parameter_name: 'first_name' },
    { type: 'text', text: 'SAVE', parameter_name: 'promo' }
  ]);
});

test('omits parameter_name when format is missing and skips blank values', () => {
  const payload = payloadFor(['', 'Ada', '   '], {
    parameters: [
      { name: 'body_param_1', component: 'BODY' },
      { name: 'body_param_2', component: 'BODY' },
      { name: 'body_param_3', component: 'BODY' }
    ]
  });

  assert.deepEqual(parameterTexts(payload), [{ type: 'text', text: 'Ada' }]);
  assert.equal(JSON.stringify(payload).includes('parameter_name'), false);
});
