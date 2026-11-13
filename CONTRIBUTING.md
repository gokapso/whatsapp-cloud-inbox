# Contributing to WhatsApp Cloud Inbox

Thanks for your interest in contributing! This guide will help you get started.

## Code of Conduct

Be respectful, constructive, and collaborative. We're building a tool to make WhatsApp Cloud API easier to use.

## Ways to Contribute

- **Report bugs** - Found something broken? Let us know
- **Suggest features** - Have ideas for improvements? We'd love to hear them
- **Fix issues** - Check our [issue tracker](https://github.com/gokapso/whatsapp-cloud-inbox/issues)
- **Improve docs** - Documentation improvements are always welcome
- **Add features** - Help us add new WhatsApp Cloud API features

## Getting Started

### Prerequisites

- **Node.js 20+**
- **npm** or **pnpm**
- **Kapso account** - Get credentials from [app.kapso.ai](https://app.kapso.ai)

### Development Setup

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/whatsapp-cloud-inbox.git
cd whatsapp-cloud-inbox
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

Create `.env`:

```env
PHONE_NUMBER_ID=your_phone_number_id
KAPSO_API_KEY=your_kapso_api_key
WABA_ID=your_business_account_id
```

4. **Start development server**

```bash
npm run dev
```

5. **Open the app**

Navigate to `http://localhost:4000`

### Project Structure

```
whatsapp-cloud-inbox/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── api/                # API routes
│   │   ├── layout.tsx          # Root layout
│   │   └── page.tsx            # Main page
│   ├── components/             # React components
│   │   ├── chat/               # Chat UI components
│   │   ├── sidebar/            # Sidebar components
│   │   └── ui/                 # Reusable UI components
│   ├── hooks/                  # Custom React hooks
│   ├── lib/                    # Utilities
│   └── types/                  # TypeScript types
├── public/                     # Static assets
└── assets/                     # Project assets
```

## Development Workflow

### 1. Create a feature branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/issue-description
```

### 2. Make your changes

- Write clear, focused commits
- Follow existing code style
- Test your changes thoroughly
- Update documentation if needed

### 3. Test your changes

```bash
# Run the dev server
npm run dev

# Test in browser
# Open http://localhost:4000

# Check for TypeScript errors
npm run build
```

### 4. Commit your changes

```bash
git add .
git commit -m "feat: add support for X"
# or
git commit -m "fix: resolve issue with Y"
```

Use conventional commit format:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `style:` - UI/styling changes
- `refactor:` - Code refactoring
- `test:` - Adding tests
- `chore:` - Maintenance tasks

### 5. Push and create a Pull Request

```bash
git push origin feature/your-feature-name
```

Then open a PR on GitHub with:
- Clear description of what changed and why
- Reference any related issues (`Fixes #123`)
- Screenshots/videos for UI changes

## Common Tasks

### Adding a New Message Type

1. **Update types** in `src/types/`
2. **Add UI component** in `src/components/chat/`
3. **Update API route** in `src/app/api/`
4. **Test with real WhatsApp API**

### Adding a New Feature

1. **Check WhatsApp Cloud API docs** - Verify the feature is supported
2. **Update Kapso SDK** - May need to update `@kapso/whatsapp-cloud-api`
3. **Add UI components** - Create necessary UI elements
4. **Add API routes** - Create Next.js API routes
5. **Test thoroughly** - Test with real phone numbers

### Fixing a Bug

1. **Reproduce the issue** - Verify you can reproduce it
2. **Identify the cause** - Debug to find the root cause
3. **Fix the bug** - Make the necessary changes
4. **Test** - Verify the fix works
5. **Check for regressions** - Ensure nothing else broke

## Pull Request Guidelines

### Before Submitting

- [ ] Code builds without errors (`npm run build`)
- [ ] Changes are tested with real WhatsApp API
- [ ] Documentation is updated if needed
- [ ] Commit messages follow conventional format
- [ ] PR description explains what and why
- [ ] Screenshots/videos included for UI changes

### PR Title Format

Use conventional commit format:
```
feat(chat): add support for voice messages
fix(templates): resolve parameter parsing issue
docs: improve setup instructions
```

### Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, a maintainer will merge

## Tech Stack

- **Next.js 15** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS 4** - Styling
- **Radix UI** - Accessible components
- **Kapso WhatsApp Cloud API** - WhatsApp integration

## WhatsApp Cloud API Guidelines

### Message Types

- **Text** - Simple text messages
- **Media** - Images, videos, audio, documents
- **Templates** - Pre-approved message templates
- **Interactive** - Button and list messages

### 24-Hour Window

WhatsApp enforces a 24-hour messaging window:
- **Within 24h of last user message** - Send any message type
- **Outside 24h** - Only template messages allowed
- Always check `canSendRegularMessage` before sending

### Template Messages

- Must be pre-approved by WhatsApp
- Support header, body, and button parameters
- Use named or positional parameters
- Test with real templates from your account

## Testing

### Manual Testing

1. **Set up test environment** - Use test phone numbers
2. **Test all message types** - Text, media, templates, buttons
3. **Test 24-hour window** - Verify enforcement works
4. **Test error handling** - Try invalid inputs
5. **Test UI responsiveness** - Check mobile and desktop

### Testing with Real API

Always test with real WhatsApp Cloud API:
- Use test phone numbers
- Verify message delivery
- Check read receipts
- Test failed message indicators

## Getting Help

- **GitHub Issues** - [Report bugs or request features](https://github.com/gokapso/whatsapp-cloud-inbox/issues)
- **Kapso Support** - [app.kapso.ai](https://app.kapso.ai)
- **WhatsApp Cloud API Docs** - [developers.facebook.com/docs/whatsapp](https://developers.facebook.com/docs/whatsapp)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing! 🚀
