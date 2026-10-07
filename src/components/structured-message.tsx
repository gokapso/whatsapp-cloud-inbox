import { MapPin, ShoppingBag, Contact, FileCheck2 } from "lucide-react";
import type { Message } from "@/lib/inbox-data";
import { WhatsappFormattedText } from "@/components/whatsapp-formatted-text";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function StructuredMessage({ message }: { message: Message }) {
  if (message.flowResponse) {
    return (
      <div className="mb-2 min-w-48 text-xs">
        <p className="mb-2 flex items-center gap-1.5 font-medium">
          <FileCheck2 className="size-3.5" />
          {message.flowName || "Flow response"}
        </p>
        <dl className="space-y-1.5">
          {Object.entries(message.flowResponse)
            .filter(([key]) => key !== "flow_token")
            .map(([key, value]) => (
              <div key={key}>
                <dt className="text-[10px] text-muted-foreground">
                  {key.replace(/_/g, " ")}
                </dt>
                <dd className="break-words">
                  {typeof value === "string" ? value : JSON.stringify(value)}
                </dd>
              </div>
            ))}
        </dl>
      </div>
    );
  }
  if (message.location) {
    const { latitude, longitude, name, address } = message.location;
    const hasCoordinates =
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude);
    return (
      <div className="mb-2 min-w-40 text-xs">
        <p className="flex items-center gap-1.5 font-medium">
          <MapPin className="size-3.5" />
          {name || "Location"}
        </p>
        {address && <p className="mt-1 text-muted-foreground">{address}</p>}
        {hasCoordinates && (
          <a
            className="mt-2 inline-block text-primary underline"
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on map
          </a>
        )}
      </div>
    );
  }
  if (message.order) {
    return (
      <div className="mb-2 text-xs">
        <p className="mb-2 flex items-center gap-1.5 font-medium">
          <ShoppingBag className="size-3.5" />
          Order
        </p>
        {message.order.productItems?.map((item, index) => (
          <p key={index} className="mb-1">
            {text(item.productRetailerId ?? item.product_retailer_id) ||
              "Product"}{" "}
            · {String(item.quantity ?? 1)} ×{" "}
            {String(item.itemPrice ?? item.item_price ?? "")}{" "}
            {text(item.currency)}
          </p>
        ))}
        {(message.orderText || message.order.orderText) && (
          <p>{message.orderText || message.order.orderText}</p>
        )}
      </div>
    );
  }
  if (message.contacts?.length) {
    return (
      <div className="mb-2 space-y-2 text-xs">
        {message.contacts.map((contact, index) => (
          <div key={index}>
            <p className="flex items-center gap-1.5 font-medium">
              <Contact className="size-3.5" />
              {text(
                record(contact.name).formattedName ??
                  record(contact.name).formatted_name,
              ) || "Shared contact"}
            </p>
            {Array.isArray(contact.phones) &&
              contact.phones.map((phone, index) => (
                <p
                  key={index}
                  className="mt-1 select-text text-muted-foreground"
                >
                  {text(record(phone).phone)}
                </p>
              ))}
          </div>
        ))}
      </div>
    );
  }
  if (message.interactive) {
    const interactive = message.interactive;
    const reply = record(
      interactive.buttonReply ??
        interactive.button_reply ??
        interactive.listReply ??
        interactive.list_reply,
    );
    const body = text(record(interactive.body).text);
    const footer = text(record(interactive.footer).text);
    const action = record(interactive.action);
    const buttons = Array.isArray(action.buttons) ? action.buttons : [];
    const sections = Array.isArray(action.sections) ? action.sections : [];
    return (
      <div className="mb-2 min-w-40 text-xs">
        {text(reply.title) && <p>{text(reply.title)}</p>}
        {body && body !== message.content && (
          <p className="whitespace-pre-wrap text-sm">
            <WhatsappFormattedText text={body} />
          </p>
        )}
        {footer && (
          <p className="mt-1 text-[10px] text-muted-foreground">{footer}</p>
        )}
        {buttons.map((button, index) => (
          <div
            key={index}
            className="mt-2 rounded border border-border/60 px-2 py-1.5 text-center"
          >
            {text(record(record(button).reply).title) ||
              text(record(button).text)}
          </div>
        ))}
        {sections.map((section, index) => (
          <div key={index} className="mt-2 border-t pt-2">
            <p className="font-medium">{text(record(section).title)}</p>
            {Array.isArray(record(section).rows) &&
              (record(section).rows as unknown[]).map((row, index) => (
                <p key={index} className="mt-1 text-muted-foreground">
                  {text(record(row).title)}
                </p>
              ))}
          </div>
        ))}
      </div>
    );
  }
  if (message.template?.name && !message.content) {
    return (
      <p className="mb-1 text-xs">
        Template · {message.template.name.replace(/_/g, " ")}
      </p>
    );
  }
  return null;
}
