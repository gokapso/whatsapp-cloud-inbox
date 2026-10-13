import {
  WHATSAPP_FORMAT_MARKERS,
  type WhatsappTextFormat,
} from "./whatsapp-text-formatter";

export function toggleComposerFormat(
  value: string,
  from: number,
  to: number,
  format: WhatsappTextFormat,
) {
  const marker = WHATSAPP_FORMAT_MARKERS[format];
  const selection = value.slice(from, to);
  if (from > 0 && value[from - 1] === marker && value[to] === marker) {
    return {
      value: value.slice(0, from - 1) + selection + value.slice(to + 1),
      from: from - 1,
      to: to - 1,
    };
  }
  if (
    selection.length >= 2 &&
    selection.startsWith(marker) &&
    selection.endsWith(marker)
  ) {
    return {
      value: value.slice(0, from) + selection.slice(1, -1) + value.slice(to),
      from,
      to: to - 2,
    };
  }
  return {
    value: value.slice(0, from) + marker + selection + marker + value.slice(to),
    from: from + 1,
    to: to + 1,
  };
}
