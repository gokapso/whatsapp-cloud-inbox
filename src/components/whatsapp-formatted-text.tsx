import { formatWhatsappText } from "@/lib/whatsapp-text-formatter";

export function WhatsappFormattedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  // The shared Kapso formatter escapes all user text before adding its fixed formatting tags.
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: formatWhatsappText(text) }}
    />
  );
}
