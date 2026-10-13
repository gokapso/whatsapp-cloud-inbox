import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertConversationNumber,
  validateConversationStatusInput,
  updatePlatformConversationStatus,
} from "../src/lib/conversation-status";
import { InboxRequestError } from "../src/lib/inbox-errors";
import { inboxErrorResponse } from "../src/lib/inbox-server-errors";

describe("conversation lifecycle boundaries", () => {
  it("accepts closing and reopening only with an explicit business number", () => {
    assert.deepEqual(
      validateConversationStatusInput({
        status: "ended",
        phoneNumberId: " business-one ",
      }),
      { status: "ended", phoneNumberId: "business-one" },
    );
    assert.equal(
      validateConversationStatusInput({
        status: "active",
        phoneNumberId: "business-one",
      }).status,
      "active",
    );
    for (const body of [
      null,
      {},
      { status: "deleted", phoneNumberId: "one" },
      { status: "ended" },
      { status: "active", phoneNumberId: 2 },
    ])
      assert.throws(() => validateConversationStatusInput(body));
  });
  it("rejects a conversation from another number or an unverifiable scope", () => {
    assert.doesNotThrow(() =>
      assertConversationNumber("business-one", "business-one"),
    );
    assert.throws(() =>
      assertConversationNumber("business-two", "business-one"),
    );
    assert.throws(() => assertConversationNumber(undefined, "business-one"));
  });
  it("preserves Platform API failures and retry information", async () => {
    const response = inboxErrorResponse(
      new InboxRequestError(429, { error: "Rate limited", retryAfterMs: 2500 }),
    );
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "3");
    assert.deepEqual(await response.json(), {
      error: "Rate limited",
      retryAfterMs: 2500,
    });
  });
  it("checks ownership before issuing exactly one Platform API status update", async () => {
    const requests: RequestInit[] = [];
    const request = (async (_url, options) => {
      requests.push(options!);
      return Response.json({
        data: {
          id: "conversation-one",
          phone_number_id: "number-one",
          status: options?.method === "PATCH" ? "ended" : "active",
        },
      });
    }) as typeof fetch;
    const result = await updatePlatformConversationStatus(
      {
        url: "https://example.test/conversations/one",
        apiKey: "fictional-key",
        phoneNumberId: "number-one",
        status: "ended",
      },
      request,
    );
    assert.equal(result.status, "ended");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].method, "PATCH");
    assert.deepEqual(JSON.parse(requests[1].body as string), {
      whatsapp_conversation: { status: "ended" },
    });
  });
  it("does not write after a scope mismatch and does not retry a rejected update", async () => {
    let requests = 0;
    const mismatched = (async () => {
      requests++;
      return Response.json({ data: { phone_number_id: "other-number" } });
    }) as typeof fetch;
    const input = {
      url: "https://example.test/conversations/one",
      apiKey: "fictional-key",
      phoneNumberId: "number-one",
      status: "ended" as const,
    };
    await assert.rejects(
      updatePlatformConversationStatus(input, mismatched),
      /does not belong/,
    );
    assert.equal(requests, 1);
    requests = 0;
    const rejected = (async (_url, options) => {
      requests++;
      return options?.method === "PATCH"
        ? Response.json({ error: "Forbidden" }, { status: 403 })
        : Response.json({ data: { phone_number_id: "number-one" } });
    }) as typeof fetch;
    await assert.rejects(
      updatePlatformConversationStatus(input, rejected),
      (error: unknown) =>
        error instanceof InboxRequestError && error.status === 403,
    );
    assert.equal(requests, 2);
  });
});
