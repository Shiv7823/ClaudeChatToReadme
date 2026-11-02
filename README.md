# AI Chat Context Exporter

AI Chat Context Exporter takes conversation context (from Claude, ChatGPT, Gemini, or Grok) and transforms it into a clean, compact, structured context handoff file (`.md`, `.txt`, `.doc`, or `.pdf`) designed to be dropped directly into a fresh chat session without carrying over unnecessary conversation history or blowing your token budget.

Powered by a single-file **Python FastAPI** serverless backend and a lightweight, dependency-free frontend deployable on **Vercel**.

---

## Project Structure

```
├── api/
│   ├── index.py         # Complete FastAPI backend in a single file
│   └── generate.py      # Vercel entrypoint router
├── public/
│   └── index.html       # Self-contained frontend application with bookmarklet generator
├── tests/
│   ├── test_backend.py            # Python unittest suite for backend payload shapes
│   ├── test_bookmarklet.js        # Bookmarklet reference module
│   ├── test_bookmarklet_runner.js # Node.js test suite for adapters, DOM-to-MD, CSP, gzip
│   └── test_frontend.js           # JSDOM integration tests for UI and #ace= hash import
├── requirements.txt     # Python dependencies (fastapi, uvicorn, httpx, python-multipart)
├── vercel.json          # Vercel serverless routing, rewrite rules, and CORS configuration
└── README.md            # Project documentation and deployment guide
```

---

## How It Works

```
Browser (public/index.html)
   │  POST /api/ (url OR text, budgetMode, budgetValue, recent, format)
   ▼
api/index.py (FastAPI Serverless Backend)
   │
   ├──▶ prepare()
   │       Validates HTTPS or parsed JSON, blocks credentials and custom ports, maps provider.
   │
   ├──▶ extract()
   │       Parses bookmarklet payload / Claude snapshot JSON / ChatGPT mapping / pasted text.
   │
   ├──▶ compress()
   │       Deduplicates code semantically (fingerprinting function/class/var names),
   │       extracts structured points under assistant headings, verbatim tables,
   │       and scores user requirements and decisions by recency and relevance.
   │
   ├──▶ assemble()
   │       Assembles structured markdown handoff document and enforces
   │       progressive token budgeting without dropping code or decisions.
   │
   └──▶ package_file()
           Packages into .md, .txt, Word XML .doc, or native PDF 1.4.
   │
   ▼
Browser receives binary download with Content-Disposition & Content-Type
```

---

## One-Click Browser Capture (Bookmarklet)

The fastest and most reliable way to capture conversations is the built-in **Browser capture bookmarklet**. It reads what your browser already renders on the chat page without requiring headless browsers, API tokens, or copy-pasting.

### 1. How to Install the Bookmarklet
1. Open the app (`http://localhost:8000` or your Vercel deployment URL).
2. On the **Browser capture (recommended)** tab, look for the **✦ Send to Context Exporter** button.
3. Drag the button directly into your browser's bookmarks bar (press `Ctrl+Shift+B` on Windows/Linux or `Cmd+Shift+B` on macOS if the bar is hidden).
   - *Manual alternative:* Create a new bookmark in your browser, name it "Send to Context Exporter", and set its URL to the script copied from the app.

### 2. How to Use
1. Open any chat or public share link on **Claude** (`claude.ai`), **ChatGPT** (`chatgpt.com`), **Gemini** (`gemini.google.com`), or **Grok** (`grok.com`).
2. Click the **Send to Context Exporter** bookmark in your browser bar.
3. A floating overlay appears on the chat page showing the capture diagnostics (message counts, character size, warnings).
4. Click **Open in Context Exporter**:
   - The conversation is compressed (gzip) and transferred in the URL hash (`#ace=...`).
   - The app opens in a new tab, decodes the conversation into the paste textarea, clears the URL hash from your browser history, and displays a confirmation banner.
   - Select your desired token budget and export format, then click **Generate file →**.

### 3. Console Fallback
If a site's Content Security Policy (CSP) blocks bookmarklet execution:
1. In the app, click **Copy script (console fallback)** to copy the self-contained script to your clipboard.
2. Go to your open chat tab on Claude, ChatGPT, Gemini, or Grok.
3. Press `F12` (or `Cmd+Option+I`) to open Developer Tools and select the **Console** tab.
4. Paste the script into the console and press `Enter`.
5. The capture overlay will appear immediately.

### 4. Privacy & Security Notes
- **Read-Only:** The bookmarklet never reads or accesses cookies (`document.cookie`), local/session storage (`localStorage`, `sessionStorage`, `indexedDB`), or authentication headers.
- **Strict-CSP / Trusted-Types Safe:** The overlay is constructed strictly using `document.createElement`, `element.textContent`, and direct `element.style.<property>` assignments. It contains zero `innerHTML`, no string style attributes, and no inline event handler attributes.
- **No Unauthorized Network Traffic:** The bookmarklet sends no data anywhere in the background. On `claude.ai/share/<uuid>`, it attempts a single same-origin read of the public share snapshot (`/api/chat_snapshots/...`). Otherwise, it uses pure DOM extraction.
- **Data Leaves Only on Your Action:** Chat data leaves the page only when you explicitly click a button in the overlay:
  - *Open in Context Exporter:* Transferred to your app tab via URL fragment (`#ace=...`) compressed with browser `CompressionStream('gzip')`. If the compressed payload exceeds 1.5 MB, the URL transfer is halted to prevent URL truncation, and you are prompted to download the `.json` file instead.
  - *Copy as text:* Copies the transcript to your local clipboard.
  - *Download .json:* Saves the raw export directly to your local downloads folder.

### 5. How to Fix a Broken Selector
AI web apps update their DOM structure periodically. All selectors are centralized in the `ADAPTERS` registry inside [`public/index.html`](file:///z:/Personal_Data/Projects/claude2md/claudechattoreadme/public/index.html) (and [`AI_Chat_Context_Exporter_READY.html`](file:///z:/Personal_Data/Projects/claude2md/claudechattoreadme/AI_Chat_Context_Exporter_READY.html)):

```javascript
var ADAPTERS = [
  {
    name: 'claude',
    match: function(u) { return /(^|\.)claude\.ai$/.test(u.hostname); },
    selectors: { user: '[data-testid="user-message"]', assistant: '.font-claude-response, [data-testid="assistant-message"]' },
    ...
  },
  {
    name: 'chatgpt',
    match: function(u) { return /(^|\.)(chatgpt\.com|chat\.openai\.com)$/.test(u.hostname); },
    selectors: { turn: '[data-message-author-role]' },
    ...
  },
  {
    name: 'gemini',
    match: function(u) { return /(^|\.)gemini\.google\.com$/.test(u.hostname); },
    selectors: { user: 'user-query, [data-test-id="user-query"]', assistant: 'model-response, [data-test-id="model-response"]' },
    ...
  },
  {
    name: 'grok',
    match: function(u) { return /(^|\.)(grok\.com|x\.com)$/.test(u.hostname); },
    selectors: { turn: '[data-testid="message"], div[class*="message"]' },
    ...
  }
];
```

To update a selector:
1. Open the chat page in your browser, right-click the user or assistant message, and select **Inspect**.
2. Note the stable attribute (such as `data-testid`, custom element tag, or class name).
3. Update the corresponding selector string in the `ADAPTERS` registry.
4. Run `npm test` to verify with tests.

---

## Getting the Chat In (Input Methods)

There are three ways to get a chat into Context Exporter:

1. **Browser capture (recommended)**: Click the bookmarklet on any open chat or share page. Supports Claude, ChatGPT, Gemini, Grok, and any other AI conversation without copy-pasting.
2. **Paste chat text / file**: Paste raw conversation text (speaker labels like `You:` / `Claude:` / `ChatGPT said:` are automatically detected), a Markdown export, or a `conversations.json` export file from Claude or ChatGPT (the most recently updated chat is parsed).
3. **claude.ai share link**: The server reads the public snapshot JSON that the share page itself loads. If claude.ai blocks the cloud IP with a bot challenge, switch to Browser capture or Paste.

---

## Deploy to Vercel

Deploying to Vercel using `vercel-python`:

### 1. Install Vercel CLI (if not already installed)
```bash
npm install -g vercel
```

### 2. Log in and Deploy
```bash
vercel login
vercel
```

For production deployment:
```bash
vercel --prod
```

Vercel will detect `requirements.txt` and `api/index.py`, automatically provision the Python runtime, and host your static frontend from `/public/index.html`.

---

## Local Development & Testing

### 1. Install dependencies
```bash
pip install -r requirements.txt
npm install
```

### 2. Run test suites
```bash
# Run Node.js tests (adapters, DOM-to-Markdown converter, CSP, gzip, UI hash import)
npm test

# Run Python backend tests (payload shapes, snapshot nesting, diagnostics warnings)
npm run test:python
```

### 3. Run the development server
```bash
uvicorn api.index:app --reload --port 8000
```

### 4. Open the app
Navigate directly to:
```
http://localhost:8000
```
FastAPI automatically serves `public/index.html` at `http://localhost:8000/`, with API requests pointing directly to `/api/generate` on the same port.

---

## Configuration

| Parameter | Options / Format | Default | Description |
|---|---|---|---|
| `url` / `text` | Public HTTPS link or chat text / JSON | Required | Chat content or share link. |
| `budgetMode` | `"fixed"` \| `"dynamic"` | `"fixed"` | Dynamic skips all trimming to retain the entire conversation. |
| `budgetValue`| `2000`, `5000`, `10000`, `20000` | `5000` | Target token limit for fixed budgets. Trims recent messages and lists first; never drops code or decisions. |
| `recent` | Number (1–50) | `8` | Number of recent messages to preserve in the transcript section. |
| `format` | `"readme"`, `"txt"`, `"doc"`, `"pdf"` | `"readme"` | Output format for the downloaded context file (`.md`, `.txt`, `.doc`, `.pdf`). |

---

## License

MIT License. Free for personal and commercial use.
