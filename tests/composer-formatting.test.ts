import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toggleComposerFormat } from "../src/lib/composer-formatting";
import { formatWhatsappText } from "../src/lib/whatsapp-text-formatter";

describe("WhatsApp formatting", () => {
  it("keeps the selected text selected while applying and removing a format", () => {
    const formatted = toggleComposerFormat("Hello Rodrigo", 6, 13, "bold");
    assert.deepEqual(formatted, { value: "Hello *Rodrigo*", from: 7, to: 14 });
    assert.deepEqual(
      toggleComposerFormat(
        formatted.value,
        formatted.from,
        formatted.to,
        "bold",
      ),
      { value: "Hello Rodrigo", from: 6, to: 13 },
    );
  });
  it("inserts an editable pair at the cursor and keeps multiline text intact", () => {
    assert.deepEqual(toggleComposerFormat("Hi\nthere", 3, 3, "italic"), {
      value: "Hi\n__there",
      from: 4,
      to: 4,
    });
  });
  it("renders nested emphasis and literal code using Kapso formatting rules", () => {
    assert.equal(
      formatWhatsappText("*Hello _Rodrigo_* ~old~"),
      "<strong>Hello <em>Rodrigo</em></strong> <s>old</s>",
    );
    assert.match(
      formatWhatsappText("`*literal*`"),
      /<code[^>]*>\*literal\*<\/code>/,
    );
  });
  it("does not interpret identifiers or unmatched markers as formatting", () => {
    assert.equal(
      formatWhatsappText("customer_id and *unfinished"),
      "customer_id and *unfinished",
    );
  });
  it("escapes HTML and event handlers before adding formatting tags", () => {
    const html = formatWhatsappText('*<img src=x onerror="alert(1)">*');
    assert.equal(
      html,
      "<strong>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</strong>",
    );
    assert.doesNotMatch(html, /<img|<script/);
  });
});
