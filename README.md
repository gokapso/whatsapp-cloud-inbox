# WhatsApp Inbox

A WhatsApp Web-style inbox built with Next.js for the WhatsApp Cloud API. Send messages, templates, and interactive buttons with a familiar UI.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgokapso%2Fwhatsapp-cloud-inbox&env=PHONE_NUMBER_ID,KAPSO_API_KEY,WABA_ID&envDescription=Get%20these%20credentials%20from%20app.kapso.ai&envLink=https%3A%2F%2Fapp.kapso.ai)

![WhatsApp Cloud Inbox](https://cdn.jsdelivr.net/gh/gokapso/whatsapp-cloud-inbox@main/assets/kapso-whatsapp-inbox.png)

## Features

- **Real-time messaging** - Auto-polling keeps conversations updated
- **Template messages** - Full support for WhatsApp templates with parameters (header, body, buttons)
- **Interactive messages** - Send button messages with up to 3 custom actions
- **Media support** - Send images, videos, documents, and audio
- **24-hour window enforcement** - Automatically restricts messaging outside WhatsApp's window
- **Failed message indicators** - Visual feedback for delivery failures
- **WhatsApp-style UI** - Familiar interface with read receipts, timestamps, and message bubbles

## Setup

### 1. Get Kapso credentials

1. Create account at [app.kapso.ai](https://app.kapso.ai)
2. Connect a WhatsApp number
3. Get your credentials:
   - `PHONE_NUMBER_ID`
   - `KAPSO_API_KEY`
   - `WABA_ID`

### 2. Clone and install

```bash
git clone https://github.com/gokapso/whatsapp-cloud-inbox.git
cd whatsapp-cloud-inbox
npm install
```

### 3. Environment variables

Create `.env`:

```env
PHONE_NUMBER_ID=your_phone_number_id
KAPSO_API_KEY=your_kapso_api_key
WABA_ID=your_business_account_id
```

### 4. Run

```bash
npm run dev
```

Open [http://localhost:4000](http://localhost:4000)

## Key Features

### Template Messages

Send WhatsApp-approved templates with dynamic parameters:
- **Header + Body + Button parameters** - Full template support
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
- ✅ Template messages (with all parameter types)
- ✅ Interactive button messages
- ✅ Failed message indicators

## Contributing

Issues and PRs welcome. Keep it simple.

## License

MIT
