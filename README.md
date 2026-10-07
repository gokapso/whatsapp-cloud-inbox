# WhatsApp Inbox

A WhatsApp Web-style inbox built with Next.js for the WhatsApp Cloud API. Send messages, templates, and interactive buttons with a familiar UI.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgokapso%2Fwhatsapp-cloud-inbox&env=KAPSO_API_KEY&envDescription=Get%20your%20Kapso%20API%20key%20from%20app.kapso.ai&envLink=https%3A%2F%2Fapp.kapso.ai)

![WhatsApp Cloud Inbox](https://cdn.jsdelivr.net/gh/gokapso/whatsapp-cloud-inbox@main/assets/kapso-whatsapp-inbox.png)

## Features

- **Real-time messaging** - Auto-polling keeps conversations updated
- **BSUID recipients** - Display and search phone-less contacts; send text, media, templates, and buttons using their business-scoped user ID
- **Paginated history** - Load more conversations and older messages, including previous conversations with the same contact
- **Template messages** - Send approved templates with named or positional text parameters
- **Interactive messages** - Send button messages with up to 3 custom actions
- **Media support** - Send images, videos, documents, and audio
- **24-hour window enforcement** - Automatically restricts messaging outside WhatsApp's window
- **Actionable errors** - Preserve routing, credit, rate-limit, and provider errors without losing your draft
- **Message attribution** - Show Meta agent, other-app, standby-copy, and delivery failure details when Kapso supplies them
- **WhatsApp-style UI** - Familiar interface with read receipts, timestamps, and message bubbles

## Setup

### 1. Get Kapso credentials

1. Create account at [app.kapso.ai](https://app.kapso.ai)
2. Connect a WhatsApp number
3. Get your Kapso API key

### 2. Clone and install

Use [Bun](https://bun.sh/) and Node.js 20.19 or newer (required by the WhatsApp SDK).

```bash
git clone https://github.com/gokapso/whatsapp-cloud-inbox.git
cd whatsapp-cloud-inbox
bun install
```

### 3. Environment variables

Create `.env`:

```env
KAPSO_API_KEY=your_kapso_api_key
WHATSAPP_API_URL=https://api.kapso.ai/meta/whatsapp  # Optional: custom API endpoint

# Optional: only needed when your platform API is on a different host
KAPSO_API_BASE_URL=https://api.kapso.ai

# Optional: backwards-compatible single-number fallback
PHONE_NUMBER_ID=your_phone_number_id
WABA_ID=your_business_account_id
```

### 4. Run

```bash
bun run dev
```

Open [http://localhost:4000](http://localhost:4000)

Open [http://localhost:4000/settings](http://localhost:4000/settings) to choose which WhatsApp numbers the inbox tracks. The app discovers `PHONE_NUMBER_ID` and `WABA_ID` values from Kapso using `KAPSO_API_KEY`, then stores the selected numbers in an HTTP-only cookie.

## Key Features

### Kapso-style Inbox

- Compact conversation list, consistent contact avatars, centered timeline, and a multiline composer in light and dark mode.
- Bold, italic, strikethrough, and code formatting. Enter sends; Shift+Enter inserts a new line. Cmd/Ctrl+B and Cmd/Ctrl+I format selected text.
- Attach files with the picker, paste, or drag and drop. Rejected sends retain the draft, attachment, and quoted reply.
- Recent history loads across sessions automatically, up to three pages while fewer than 50 messages are loaded. Older history remains explicitly paginated; polling refreshes the newest page.
- Contact details show the available identity, business number, reply window, and loaded conversation history.
- New conversations start with an approved template, addressed to a phone number or BSUID.
- Close and reopen conversations through the public Kapso Platform API, after checking the selected business number. These actions update the conversation in Kapso.
- Render WhatsApp formatting, Flow responses, locations, orders, shared contacts, and interactive message options.
- Filter loaded conversations by business number, status, and search.

Per-user unread state, team assignment controls, agent/automation controls, AI drafting, and voice recording are not implemented in this release. The standalone app does not use Kapso's private signed-in Inbox endpoints. Closing a conversation is independent of WhatsApp's 24-hour messaging window.

### Template Messages

Send WhatsApp-approved templates with dynamic parameters:
- **Text parameters** - Header, body, and supported button parameters
- **Named and positional parameters** - Automatic detection
- **Two-step flow** - Select template → Fill parameters → Send

### Interactive Messages

Create button messages without templates:
- **Header (optional)** + **Body (required)** + **Buttons (1-3)**
- Each button gets a unique ID and title (max 20 chars)
- Ideal for quick replies, confirmations, menu selections

### 24-Hour Window

Automatically enforces WhatsApp's messaging policy:
- **Within 24h** - Send regular messages freely
- **Outside 24h** - Template-only mode with clear messaging
- **No inbound messages** - Guide users to send templates

### Message Types

- ✅ Text messages
- ✅ Images, videos, audio, documents
- ✅ Template messages with text parameters
- ✅ Interactive button messages
- ✅ Failed message indicators

## Identity and history

Contacts are grouped within each tracked business number by BSUID, with phone or parent-ID fallback for older records. A phone or parent ID links to a BSUID only when the loaded records identify one unambiguous contact. The same BSUID on two business numbers remains two separate inbox threads.

Use **Load more conversations** and **Load older messages** to retrieve additional pages. Search and status counts cover the conversations already loaded. Search matches contact names, usernames, phone numbers (including pasted formatting), business numbers, BSUIDs, parent BSUIDs, and session IDs; it does not search message text or unloaded conversations. After loading older history, automatic polling refreshes only the latest page. The regular-message composer uses Kapso's last inbound timestamp as well as loaded messages to determine the 24-hour service window.

For server-side contact filtering, the public [Platform Contacts API](https://docs.kapso.ai/api/platform/v1/contacts/list-contacts) accepts `profile_name_contains`, `wa_id_contains`, and exact `business_scoped_user_id`. The [Platform Conversations API](https://docs.kapso.ai/api/platform/v1/conversations/list-conversations) accepts `phone_number` and other structured filters. Neither exposes the hosted Inbox's unified free-text search through a project API key, and this app's `/api/conversations` route does not accept a search query.

A rejected send keeps your draft and attachment. An accepted send followed by a failed history refresh shows a separate refresh warning. Sends are not automatically retried; reconcile an unknown result before trying again.

This inbox does not yet provide the hosted Kapso inbox's ownership controls, team assignments, shared quick replies, contact notes, server-wide search, or full structured-message viewers. Meta-agent attribution and routing errors do not grant control of a conversation. Manage ownership in Kapso before replying to a thread controlled by another application.

## Contributing

Issues and PRs welcome. Keep it simple. Source code lives in `src/app`, `src/components`, `src/hooks`, and `src/lib`.

Run the local checks:

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

The automated tests use fictional data and mock the provider transport. Live WhatsApp delivery requires a connected test project and a recipient who has agreed to receive the test messages.

## License

MIT
