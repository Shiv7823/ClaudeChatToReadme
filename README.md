# AI Chat Context Exporter

AI Chat Context Exporter takes a public AI conversation share link (from Claude, ChatGPT, Gemini, or Grok) and transforms it into a clean, compact, structured context handoff file (`.md`, `.txt`, `.doc`, or `.pdf`) designed to be dropped directly into a fresh chat session without carrying over unnecessary conversation history or blowing your token budget.

Powered by a single-file **Python FastAPI** serverless backend and a lightweight, dependency-free frontend deployable on **Vercel**.

---

## Project Structure

```
├── api/
│   └── index.py         # Complete FastAPI backend in a single file
├── public/
│   └── index.html       # Self-contained frontend application
├── requirements.txt     # Python dependencies (fastapi, uvicorn, httpx, python-multipart)
├── vercel.json          # Vercel serverless routing, rewrite rules, and CORS configuration
└── README.md            # Project documentation and deployment guide
```

---

## How It Works

```
Browser (public/index.html)
   │  POST /api/ (url, budgetMode, budgetValue, recent, format)
   ▼
api/index.py (FastAPI Serverless Backend)
   │
   ├──▶ prepare()
   │       Validates HTTPS, blocks credentials and custom ports, maps provider.
   │
   ├──▶ extract()
   │       Calls external extraction service, parses NDJSON streams,
   │       repairs upstream "$X" mangling, extracts conversation turns.
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

## Local Development

You can run both the frontend and backend on the same port (`8000`):

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the development server
```bash
uvicorn api.index:app --reload --port 8000
```

### 3. Open the app
Navigate directly to:
```
http://localhost:8000
```
FastAPI automatically serves `public/index.html` at `http://localhost:8000/`, with API requests pointing directly to `/api/generate` on the same port.

---

## Configuration

| Parameter | Options / Format | Default | Description |
|---|---|---|---|
| `url` | Public HTTPS share link | Required | Must be a public link from a supported provider. |
| `budgetMode` | `"fixed"` \| `"dynamic"` | `"fixed"` | Dynamic skips all trimming to retain the entire conversation. |
| `budgetValue`| `2000`, `5000`, `10000`, `20000` | `5000` | Target token limit for fixed budgets. Trims recent messages and lists first; never drops code or decisions. |
| `recent` | Number (1–50) | `8` | Number of recent messages to preserve in the transcript section. |
| `format` | `"readme"`, `"txt"`, `"doc"`, `"pdf"` | `"readme"` | Output format for the downloaded context file. |

---

## Supported Providers

- **Claude** (`claude.ai/share/<uuid>`)
- **ChatGPT** (`chatgpt.com/share/<uuid>`, `chat.openai.com/share/<uuid>`)
- **Gemini** (`gemini.google.com/share/<id>`)
- **Grok** (`grok.com/share/<id>`)

### Adding a New Provider

To add or enable a new provider (e.g., Poe or Perplexity):
1. Open [`api/index.py`](file:///z:/Personal_Data/Shivprasad_Vanshete/projects/claude2md/Claude2md/api/index.py).
2. Locate the `PROVIDERS` dictionary.
3. Update the provider entry with its hostname, regex path validation (`re`), and set `'supported': True`:
   ```python
   'poe.com': {'name': 'Poe', 'key': 'poe', 're': re.compile(r'^/s/.+$', re.I), 'supported': True},
   ```
4. In [`public/index.html`](file:///z:/Personal_Data/Shivprasad_Vanshete/projects/claude2md/Claude2md/public/index.html), update the provider badge card from `soon` to active.

---

## Known Limitations

- **Rate Limits**: The upstream extraction backend may rate-limit high-frequency automated requests (HTTP 429). If this occurs, wait a minute before retrying.
- **Poe & Perplexity**: URL patterns are recognized but currently marked as unsupported until upstream extraction endpoints are wired for their public share structures.
- **PDF Formatting**: The PDF engine is written in pure Python with zero external binary dependencies. It renders standard typography (Helvetica/Courier) and code blocks with gray backgrounds, prioritizing portable, clean handoffs over heavy desktop publishing styles.

---

## License

MIT License. Free for personal and commercial use.
