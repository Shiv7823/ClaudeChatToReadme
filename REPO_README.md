# AI Chat Context Exporter

Paste a public AI-chat share link, get back a compact context file (README/.md,
.txt, .doc or .pdf) you can drop into a new chat to continue the work.

## Files

- `AI_Chat_Context_Exporter_READY.html` — the frontend. Single static file, no build step.
- `AI_Chat_Context_Exporter_API.json` — the n8n workflow (webhook API backend).

## How it works

```
Browser (index.html)
   |  POST url, budgetMode, budgetValue, recent, format
   v
n8n Webhook Trigger
   -> Prepare Input1        (validate URL, resolve provider, read options)
   -> Claude2PDF Extract1   (calls the external extractor for claude.ai links)
   -> Parse Extract Response1
   -> Rule-Based Compress1  (pulls requirements/decisions/problems/code)
   -> Assemble README1      (renders markdown, fits the token budget)
   -> Format & Package      (builds .md/.txt/.doc/.pdf, sets the filename)
   -> Respond with File
```

## Deploying

### 1. Import the workflow into n8n
Import `AI_Chat_Context_Exporter_API.json`, then **activate** it. The webhook
only answers at `/webhook/<path>` while the workflow is active
(`/webhook-test/<path>` is only for manual test runs in the editor).

### 2. Expose n8n over HTTPS
If you host the frontend anywhere served over HTTPS (GitHub Pages, Netlify,
Vercel, etc.), browsers will block calls to a plain `http://` n8n URL
(mixed content). Put n8n behind HTTPS — a reverse proxy with a cert
(Caddy/nginx + Let's Encrypt), a Cloudflare Tunnel, or hosting n8n itself on
a platform that gives you HTTPS (Railway, Render, an n8n Cloud instance).

If you only ever open the HTML file locally or serve it over plain HTTP on
the same network as n8n, a plain `http://` webhook URL is fine.

### 3. Point the frontend at your webhook
Open `AI_Chat_Context_Exporter_READY.html` and set `N8N_WEBHOOK_URL` near the
top of the `<script>` block to your webhook's public URL. Alternatively,
load a small `config.js` before the main script that sets
`window.N8N_WEBHOOK_URL = "https://..."` — lets you change the endpoint per
environment without touching the committed HTML.

### 4. Push to GitHub / deploy the static file
The frontend is a single self-contained HTML file — any static host works
(GitHub Pages, Netlify, Vercel, S3, or just opening it locally). No build
step, no dependencies.

## Current limitations

- **Providers**: the only working extractor is for `claude.ai/share/...`
  links (via the `claude2pdf` service). ChatGPT, Gemini, Poe and Perplexity
  URLs are recognized by the frontend and backend but return a clear
  "not supported yet" error — add a real extractor call in `Prepare Input1`
  / a new HTTP Request node per provider to enable one.
- **PDF/DOC export**: generated without any external service or npm
  dependency (a small hand-written PDF writer, and an HTML-in-.doc file for
  Word), so formatting is plain — good for a working handoff, not a
  designed document.
- **CORS**: the webhook is configured with `Allowed Origins: *`. Lock this
  down to your actual frontend origin before making this public.
