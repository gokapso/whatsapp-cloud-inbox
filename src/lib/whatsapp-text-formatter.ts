export const WHATSAPP_FORMAT_MARKERS = {
  bold: '*',
  italic: '_',
  strikethrough: '~',
  code: '`',
} as const;

export type WhatsappTextFormat = keyof typeof WHATSAPP_FORMAT_MARKERS;

export type WhatsappSourceRange = {
  from: number;
  to: number;
};

export type WhatsappFormattingRange = WhatsappSourceRange & {
  type: WhatsappTextFormat;
  contentFrom: number;
  contentTo: number;
  openDelimiter: WhatsappSourceRange;
  closeDelimiter: WhatsappSourceRange;
};

export type WhatsappDelimiterRange = WhatsappSourceRange & {
  type: WhatsappTextFormat;
  side: 'open' | 'close';
};

export type WhatsappTextParseResult = {
  content: string;
  ranges: WhatsappFormattingRange[];
  delimiterRanges: WhatsappDelimiterRange[];
};

type OpenDelimiter = {
  position: number;
  type: WhatsappTextFormat;
};

type DelimiterDefinition = {
  marker: string;
  type: WhatsappTextFormat;
};

const INLINE_FORMATS: DelimiterDefinition[] = [
  { type: 'bold', marker: WHATSAPP_FORMAT_MARKERS.bold },
  { type: 'italic', marker: WHATSAPP_FORMAT_MARKERS.italic },
  { type: 'strikethrough', marker: WHATSAPP_FORMAT_MARKERS.strikethrough },
];

const CODE_FORMAT: DelimiterDefinition = {
  type: 'code',
  marker: WHATSAPP_FORMAT_MARKERS.code,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/u.test(character);
}

export function isWhatsappFormattingWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{M}\p{N}]/u.test(character);
}

export function getWhatsappCodePointAt(
  content: string,
  position: number,
): string | undefined {
  const codePoint = content.codePointAt(position);

  return codePoint === undefined ? undefined : String.fromCodePoint(codePoint);
}

export function getWhatsappCodePointBefore(
  content: string,
  position: number,
): string | undefined {
  const characters = Array.from(content.slice(Math.max(0, position - 2), position));

  return characters[characters.length - 1];
}

function hasOpeningBoundary(content: string, position: number, marker: string): boolean {
  const previousCharacter = getWhatsappCodePointBefore(content, position);

  return previousCharacter === undefined ||
    (previousCharacter !== marker && !isWhatsappFormattingWordCharacter(previousCharacter));
}

function hasClosingBoundary(content: string, position: number, marker: string): boolean {
  const nextCharacter = getWhatsappCodePointAt(content, position + marker.length);

  return nextCharacter === undefined ||
    nextCharacter === marker ||
    !isWhatsappFormattingWordCharacter(nextCharacter);
}

function canOpenDelimiter(
  content: string,
  position: number,
  definition: DelimiterDefinition,
  followsClosingDelimiter = false,
): boolean {
  const nextCharacter = getWhatsappCodePointAt(
    content,
    position + definition.marker.length,
  );

  return nextCharacter !== undefined &&
    nextCharacter !== definition.marker &&
    nextCharacter !== '\n' &&
    !isWhitespace(nextCharacter) &&
    (followsClosingDelimiter || hasOpeningBoundary(content, position, definition.marker));
}

function canCloseDelimiter(
  content: string,
  position: number,
  definition: DelimiterDefinition,
): boolean {
  const previousCharacter = getWhatsappCodePointBefore(content, position);

  return previousCharacter !== undefined &&
    previousCharacter !== definition.marker &&
    previousCharacter !== '\n' &&
    !isWhitespace(previousCharacter) &&
    hasClosingBoundary(content, position, definition.marker);
}

function createFormattingRange(
  type: WhatsappTextFormat,
  openPosition: number,
  closePosition: number,
): WhatsappFormattingRange {
  return {
    type,
    from: openPosition,
    to: closePosition + 1,
    contentFrom: openPosition + 1,
    contentTo: closePosition,
    openDelimiter: { from: openPosition, to: openPosition + 1 },
    closeDelimiter: { from: closePosition, to: closePosition + 1 },
  };
}

function positionsInRanges(ranges: WhatsappSourceRange[]): Set<number> {
  const positions = new Set<number>();

  for (const range of ranges) {
    for (let position = range.from; position < range.to; position += 1) {
      positions.add(position);
    }
  }

  return positions;
}

function closeFormattingDelimiter(options: {
  content: string;
  definition: DelimiterDefinition;
  excludedPositions: ReadonlySet<number>;
  openDelimiter: OpenDelimiter;
  position: number;
  ranges: WhatsappFormattingRange[];
}) {
  const {
    content,
    definition,
    excludedPositions,
    openDelimiter,
    position,
    ranges,
  } = options;

  let innerMarkerPosition = content.indexOf(
    definition.marker,
    openDelimiter.position + 1,
  );
  while (
    innerMarkerPosition >= 0 &&
    innerMarkerPosition < position &&
    excludedPositions.has(innerMarkerPosition)
  ) {
    innerMarkerPosition = content.indexOf(definition.marker, innerMarkerPosition + 1);
  }

  if (innerMarkerPosition < 0 || innerMarkerPosition >= position) {
    ranges.push(createFormattingRange(
      definition.type,
      openDelimiter.position,
      position,
    ));
  }
}

function findOpenDelimiterIndex(
  openDelimiters: OpenDelimiter[],
  type: WhatsappTextFormat,
): number {
  for (let index = openDelimiters.length - 1; index >= 0; index -= 1) {
    if (openDelimiters[index].type === type) return index;
  }

  return -1;
}

function closeOpenFormattingDelimiter(options: {
  closingDelimiterPositions: Set<number>;
  content: string;
  definition: DelimiterDefinition;
  excludedPositions: ReadonlySet<number>;
  openDelimiters: OpenDelimiter[];
  position: number;
  ranges: WhatsappFormattingRange[];
}): boolean {
  const {
    closingDelimiterPositions,
    content,
    definition,
    excludedPositions,
    openDelimiters,
    position,
    ranges,
  } = options;
  const openDelimiterIndex = findOpenDelimiterIndex(openDelimiters, definition.type);
  const openDelimiter = openDelimiters[openDelimiterIndex];
  if (!openDelimiter || !canCloseDelimiter(content, position, definition)) return false;

  openDelimiters.splice(openDelimiterIndex);
  const rangeCount = ranges.length;
  closeFormattingDelimiter({
    content,
    definition,
    excludedPositions,
    openDelimiter,
    position,
    ranges,
  });
  if (ranges.length > rangeCount) closingDelimiterPositions.add(position);

  return true;
}

function parseDelimitedRanges(
  content: string,
  definitions: DelimiterDefinition[],
  excludedRanges: WhatsappSourceRange[] = [],
): WhatsappFormattingRange[] {
  const definitionsByMarker = new Map(
    definitions.map(definition => [definition.marker, definition]),
  );
  const openDelimiters: OpenDelimiter[] = [];
  const ranges: WhatsappFormattingRange[] = [];
  const closingDelimiterPositions = new Set<number>();
  const excludedPositions = positionsInRanges(excludedRanges);

  for (let position = 0; position < content.length; position += 1) {
    if (content[position] === '\n') {
      openDelimiters.length = 0;
      continue;
    }

    if (excludedPositions.has(position)) continue;

    const definition = definitionsByMarker.get(content[position]);
    if (!definition) continue;

    if (closeOpenFormattingDelimiter({
      closingDelimiterPositions,
      content,
      definition,
      excludedPositions,
      openDelimiters,
      position,
      ranges,
    })) continue;

    if (canOpenDelimiter(
      content,
      position,
      definition,
      closingDelimiterPositions.has(position - definition.marker.length),
    )) {
      openDelimiters.push({
        type: definition.type,
        position,
      });
    }
  }

  return ranges;
}

function compareFormattingRanges(
  firstRange: WhatsappFormattingRange,
  secondRange: WhatsappFormattingRange,
): number {
  if (firstRange.from !== secondRange.from) {
    return firstRange.from - secondRange.from;
  }

  return secondRange.to - firstRange.to;
}

export function parseWhatsappText(content?: string | null): WhatsappTextParseResult {
  const normalizedContent = content ?? '';
  if (!normalizedContent) {
    return {
      content: '',
      ranges: [],
      delimiterRanges: [],
    };
  }

  const codeRanges = parseDelimitedRanges(normalizedContent, [CODE_FORMAT]);
  const inlineRanges = parseDelimitedRanges(
    normalizedContent,
    INLINE_FORMATS,
    codeRanges,
  );
  const ranges = [...codeRanges, ...inlineRanges].sort(compareFormattingRanges);
  const delimiterRanges = ranges.flatMap<WhatsappDelimiterRange>(range => [
    { ...range.openDelimiter, type: range.type, side: 'open' },
    { ...range.closeDelimiter, type: range.type, side: 'close' },
  ]);

  return {
    content: normalizedContent,
    ranges,
    delimiterRanges,
  };
}

const FORMAT_TAGS: Record<WhatsappTextFormat, { open: string; close: string }> = {
  bold: { open: '<strong>', close: '</strong>' },
  italic: { open: '<em>', close: '</em>' },
  strikethrough: { open: '<s>', close: '</s>' },
  code: {
    open: '<code class="rounded bg-background/50 px-1 py-0.5 font-mono text-[0.92em]">',
    close: '</code>',
  },
};

type FormattingEvent = {
  position: number;
  range: WhatsappFormattingRange;
  side: 'open' | 'close';
};

function formattingEvents(ranges: WhatsappFormattingRange[]): FormattingEvent[] {
  return ranges
    .flatMap<FormattingEvent>(range => [
      { position: range.openDelimiter.from, range, side: 'open' },
      { position: range.closeDelimiter.from, range, side: 'close' },
    ])
    .sort((firstEvent, secondEvent) => firstEvent.position - secondEvent.position);
}

export function formatWhatsappText(content?: string | null): string {
  const parsed = parseWhatsappText(content);
  if (!parsed.content) return '';

  const events = formattingEvents(parsed.ranges);
  const formatted: string[] = [];
  let contentPosition = 0;

  for (const event of events) {
    formatted.push(escapeHtml(parsed.content.slice(contentPosition, event.position)));
    formatted.push(FORMAT_TAGS[event.range.type][event.side]);
    contentPosition = event.position + 1;
  }

  formatted.push(escapeHtml(parsed.content.slice(contentPosition)));

  return formatted.join('');
}
