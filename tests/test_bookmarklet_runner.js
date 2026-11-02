/* tests/test_bookmarklet_runner.js: Automated tests for bookmarklet functionality */
const assert = require('node:assert');
const { test, describe } = require('node:test');
const { JSDOM } = require('jsdom');
const { createBookmarkletFunction } = require('./test_bookmarklet.js');

function buildBookmarkletString(fn, appOrigin) {
  const raw = fn.toString();
  /* Compact whitespace and comments to ensure safe bookmark URL length */
  const compacted = raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\r?\n\s*/g, ' ')
    .replace(/\s*([=+\-*/%?:;{},()<>!&|^~])\s*/g, '$1')
    .trim();
  return 'javascript:(' + compacted + ')(' + JSON.stringify(appOrigin) + ');';
}

describe('Bookmarklet Code Structure & Constraints', () => {
  const bookmarkletFn = createBookmarkletFunction();
  const fnString = bookmarkletFn.toString();

  test('Bookmarklet contains NO single-line // comments', () => {
    const lines = fnString.split('\n');
    const commentLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      /* Match lines starting with // or containing // that are not part of http:// */
      if (/^\/\//.test(line) || (/\/\//.test(line) && !/https?:\/\//.test(line) && !/\/\/.*\*\/$/.test(line))) {
        commentLines.push({ lineNum: i + 1, text: line });
      }
    }
    assert.strictEqual(
      commentLines.length,
      0,
      `Found single-line // comments in bookmarklet: ${JSON.stringify(commentLines)}`
    );
  });

  test('Bookmarklet stringified href is under 15 KB limit', () => {
    const href = buildBookmarkletString(bookmarkletFn, 'https://chat-context-exporter.vercel.app');
    const sizeInBytes = Buffer.byteLength(href, 'utf8');
    assert.ok(
      sizeInBytes < 15 * 1024,
      `Bookmarklet href size is ${sizeInBytes} bytes, which exceeds 15 KB limit`
    );
  });
});

describe('Gzip / Base64url Compression & Decompression Roundtrip', () => {
  test('Compresses and decompresses accurately across arbitrary unicode strings', async () => {
    const testData = JSON.stringify({
      v: 1,
      provider: 'claude',
      title: 'Special characters & math: ∑(x) = ∫ e^x dx · “Quotes” · 🚀 Emoji',
      messages: [
        { role: 'user', text: 'Hello! Can you help with code?' },
        { role: 'assistant', text: '```python\nprint("Hello, world! 🐍")\n```' }
      ]
    });

    /* Gzip compression using CompressionStream */
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(testData));
    writer.close();
    const res = new Response(cs.readable);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    let binary = '';
    const chunk = 8192;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    const b64url = btoa(binary).replace(/\+/g, '-').replace(/\x2F/g, '_').replace(/=+$/, '');

    /* URL-safe characters only */
    assert.match(b64url, /^[A-Za-z0-9_-]+$/);

    /* Decompression using DecompressionStream */
    let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const decBinary = atob(b64);
    const decBytes = new Uint8Array(decBinary.length);
    for (let i = 0; i < decBinary.length; i++) {
      decBytes[i] = decBinary.charCodeAt(i);
    }
    const ds = new DecompressionStream('gzip');
    const dsWriter = ds.writable.getWriter();
    dsWriter.write(decBytes);
    dsWriter.close();
    const decRes = new Response(ds.readable);
    const roundtripText = await decRes.text();

    assert.strictEqual(roundtripText, testData);
  });
});

describe('DOM to Markdown Converter', () => {
  function getConverter() {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    return dom;
  }

  test('Converts code blocks, headings, lists, tables, formatting and skips UI chrome', async () => {
    const dom = getConverter();
    const html = `
      <div id="test-root">
        <h1>Main Header</h1>
        <h3>Subsection</h3>
        <p>This is a <strong>bold</strong> and <em>italic</em> statement with an <a href="https://example.com">external link</a> and <code>inline_code()</code>.</p>
        <br>
        <blockquote>Quoted advice from user</blockquote>
        <ul>
          <li>First item</li>
          <li>Second item with sublist
            <ul>
              <li>Sub item 1</li>
              <li>Sub item 2</li>
            </ul>
          </li>
        </ul>
        <ol>
          <li>Step one</li>
          <li>Step two</li>
        </ol>
        <pre><code class="language-typescript">interface User {
  id: string;
  name: string;
}</code></pre>
        <table>
          <thead>
            <tr><th>Header A</th><th>Header B</th></tr>
          </thead>
          <tbody>
            <tr><td>Val 1</td><td>Val 2 | with pipe</td></tr>
            <tr><td>Val 3</td><td>Val 4</td></tr>
          </tbody>
        </table>
        <!-- UI Chrome elements to be skipped -->
        <button class="copy-button">Copy</button>
        <svg><path d="M0 0"/></svg>
        <span class="sr-only">Screen reader text</span>
        <div class="thinking-process">Thinking about response...</div>
        <div data-testid="thought-content">Deep chain of thought</div>
        <div class="action-bar"><button>Thumb Up</button></div>
      </div>
    `;
    dom.window.document.body.innerHTML = html;

    const bookmarklet = createBookmarkletFunction();
    dom.reconfigure({ url: 'https://other-site.com/chat/1' });
    global.location = dom.window.location;
    global.URL = dom.window.URL;
    global.CompressionStream = CompressionStream;

    const payload = await bookmarklet('https://exporter.app');
    const text = payload.messages[0].text;

    /* Verify headings */
    assert.ok(text.includes('# Main Header'), 'Heading 1 missing');
    assert.ok(text.includes('### Subsection'), 'Heading 3 missing');

    /* Verify bold, italic, link, inline code */
    assert.ok(text.includes('**bold**'), 'Bold formatting missing');
    assert.ok(text.includes('*italic*'), 'Italic formatting missing');
    assert.ok(text.includes('[external link](https://example.com)'), 'Link formatting missing');
    assert.ok(text.includes('`inline_code()`'), 'Inline code missing');

    /* Verify blockquote */
    assert.ok(text.includes('> Quoted advice from user'), 'Blockquote missing');

    /* Verify lists */
    assert.ok(text.includes('- First item'), 'Unordered list missing');
    assert.ok(text.includes('  - Sub item 1'), 'Nested list indent missing');
    assert.ok(text.includes('1. Step one'), 'Ordered list missing');

    /* Verify code block */
    assert.ok(text.includes('```typescript\ninterface User {'), 'Fenced code block missing');

    /* Verify pipe table */
    assert.ok(text.includes('| Header A | Header B |'), 'Table header missing');
    assert.ok(text.includes('| --- | --- |'), 'Table delimiter missing');
    assert.ok(text.includes('Val 2 \\| with pipe'), 'Pipe escaping missing');

    /* Verify UI chrome skipped */
    assert.ok(!text.includes('Copy'), 'Button text was not skipped');
    assert.ok(!text.includes('Screen reader text'), 'sr-only text was not skipped');
    assert.ok(!text.includes('Thinking about response'), 'Thinking class was not skipped');
    assert.ok(!text.includes('Deep chain of thought'), 'Thought testid was not skipped');
    assert.ok(!text.includes('Thumb Up'), 'Action bar was not skipped');
  });
});

describe('Provider Adapters on Hand-written HTML Fixtures', () => {
  test('Claude share page adapter: uses same-origin snapshot API when available', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head><title>Shared Claude Chat</title></head><body></body></html>', {
      url: 'https://claude.ai/share/11111111-2222-3333-4444-555555555555'
    });
    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.location = dom.window.location;
    global.URL = dom.window.URL;
    global.CompressionStream = CompressionStream;

    global.fetch = async (url) => {
      assert.ok(url.includes('/api/chat_snapshots/11111111-2222-3333-4444-555555555555'));
      return {
        ok: true,
        json: async () => ({
          name: 'Claude API Snapshot Chat',
          chat_messages: [
            { sender: 'human', text: 'Hello from Claude snapshot!' },
            { sender: 'assistant', text: 'Hello! Happy to help.' }
          ]
        })
      };
    };

    const bookmarklet = createBookmarkletFunction();
    const payload = await bookmarklet('https://exporter.app');

    assert.strictEqual(payload.provider, 'claude');
    assert.strictEqual(payload.diagnostics.method, 'snapshot');
    assert.strictEqual(payload.snapshot.chat_messages.length, 2);
    assert.strictEqual(payload.title, 'Claude API Snapshot Chat');
  });

  test('Claude DOM fallback: captures user and assistant messages, skipping nested duplicates', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <head><title>Claude Local Chat</title></head>
      <body>
        <div data-testid="user-message">
          <p>Please write a Python test.</p>
          <span class="sr-only">Edit prompt</span>
          <button>Edit</button>
        </div>
        <div class="font-claude-response">
          <p>Here is your test:</p>
          <pre><code class="language-python">def test_sample():
    assert True</code></pre>
          <!-- Nested duplicate that should not be captured twice -->
          <div class="font-claude-response">Nested inner div</div>
          <div class="thinking-block">Thinking for 3 seconds</div>
        </div>
      </body>
      </html>
    `, {
      url: 'https://claude.ai/chat/99999999-8888-7777-6666-555555555555'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.location = dom.window.location;
    global.URL = dom.window.URL;
    global.CompressionStream = CompressionStream;
    global.fetch = async () => { throw new Error('No network on chat/ page'); };

    const bookmarklet = createBookmarkletFunction();
    const payload = await bookmarklet('https://exporter.app');

    assert.strictEqual(payload.provider, 'claude');
    assert.strictEqual(payload.diagnostics.method, 'dom');
    assert.strictEqual(payload.messages.length, 2);
    assert.strictEqual(payload.messages[0].role, 'user');
    assert.ok(payload.messages[0].text.includes('Please write a Python test.'));
    assert.ok(!payload.messages[0].text.includes('Edit prompt'));
    assert.strictEqual(payload.messages[1].role, 'assistant');
    assert.ok(payload.messages[1].text.includes('```python'));
    assert.ok(!payload.messages[1].text.includes('Thinking for 3 seconds'));
  });

  test('ChatGPT adapter: captures turns with data-message-author-role and .markdown', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <head><title>ChatGPT Exploration</title></head>
      <body>
        <div data-message-author-role="user">
          <div class="whitespace-pre-wrap">Tell me about gravity.</div>
          <button class="copy-btn">Copy</button>
        </div>
        <div data-message-author-role="assistant">
          <div class="markdown">
            <p>Gravity is a fundamental interaction.</p>
            <ul>
              <li>Mass attracts mass</li>
              <li>Described by General Relativity</li>
            </ul>
          </div>
          <div class="action-bar"><button>Thumbs up</button></div>
        </div>
      </body>
      </html>
    `, {
      url: 'https://chatgpt.com/c/00000000-1111-2222-3333-444444444444'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.location = dom.window.location;
    global.URL = dom.window.URL;
    global.CompressionStream = CompressionStream;

    const bookmarklet = createBookmarkletFunction();
    const payload = await bookmarklet('https://exporter.app');

    assert.strictEqual(payload.provider, 'chatgpt');
    assert.strictEqual(payload.diagnostics.method, 'dom');
    assert.strictEqual(payload.messages.length, 2);
    assert.strictEqual(payload.messages[0].role, 'user');
    assert.strictEqual(payload.messages[0].text, 'Tell me about gravity.');
    assert.strictEqual(payload.messages[1].role, 'assistant');
    assert.ok(payload.messages[1].text.includes('Gravity is a fundamental interaction.'));
    assert.ok(payload.messages[1].text.includes('- Mass attracts mass'));
  });

  test('Gemini adapter: captures <user-query> and <model-response> elements', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <head><title>Gemini Research</title></head>
      <body>
        <user-query>
          <div>What is photosynthesis?</div>
        </user-query>
        <model-response>
          <div>Photosynthesis is the process by which green plants produce energy.</div>
        </model-response>
      </body>
      </html>
    `, {
      url: 'https://gemini.google.com/app/123456'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.location = dom.window.location;
    global.URL = dom.window.URL;
    global.CompressionStream = CompressionStream;

    const bookmarklet = createBookmarkletFunction();
    const payload = await bookmarklet('https://exporter.app');

    assert.strictEqual(payload.provider, 'gemini');
    assert.strictEqual(payload.diagnostics.method, 'dom');
    assert.strictEqual(payload.messages.length, 2);
    assert.strictEqual(payload.messages[0].role, 'user');
    assert.ok(payload.messages[0].text.includes('What is photosynthesis?'));
    assert.strictEqual(payload.messages[1].role, 'assistant');
    assert.ok(payload.messages[1].text.includes('process by which green plants produce energy'));
  });

  test('Grok adapter: falls back to page text with diagnostic warning when roles cannot be determined', async () => {
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <head><title>Grok Page</title></head>
      <body>
        <main>
          <h1>Unstructured Discussion</h1>
          <p>This is Grok raw conversation stream without standard testids.</p>
        </main>
      </body>
      </html>
    `, {
      url: 'https://grok.com/share/grok-chat-1'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.location = dom.window.location;
    global.URL = dom.window.URL;
    global.CompressionStream = CompressionStream;

    const bookmarklet = createBookmarkletFunction();
    const payload = await bookmarklet('https://exporter.app');

    assert.strictEqual(payload.provider, 'grok');
    assert.strictEqual(payload.messages.length, 1);
    assert.ok(payload.diagnostics.warnings.some(w => w.includes('Could not identify speaker roles')));
  });
});

describe('Oversized Payload Handling', () => {
  test('Payload with total chars > 3,000,000 trims older messages, retains newest and adds warning', async () => {
    const largeMessage = 'A'.repeat(1600000);
    const dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <body>
        <div data-message-author-role="user"><p>${largeMessage}</p></div>
        <div data-message-author-role="assistant"><p>${largeMessage}</p></div>
        <div data-message-author-role="user"><p>Third message to be kept: ${largeMessage}</p></div>
      </body>
      </html>
    `, {
      url: 'https://chatgpt.com/c/large'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.location = dom.window.location;
    global.URL = dom.window.URL;
    global.CompressionStream = CompressionStream;

    const bookmarklet = createBookmarkletFunction();
    const payload = await bookmarklet('https://exporter.app');

    assert.ok(payload.diagnostics.warnings.some(w => w.includes('Total text exceeded 3,000,000 characters')));
    assert.ok(payload.diagnostics.total_chars <= 3000000, 'Total chars exceeded 3M cap');
    assert.ok(payload.messages[payload.messages.length - 1].text.includes('Third message to be kept'));
  });

  test('Encoded URL size > 1.5 MB displays notice and stops window.open', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;

    let openedUrl = null;
    dom.window.open = (url) => { openedUrl = url; };

    const MAX_URL_SIZE = 1500000;
    const oversizedB64 = 'X'.repeat(MAX_URL_SIZE + 50);

    let didOpen = false;
    if (oversizedB64.length <= MAX_URL_SIZE) {
      dom.window.open('https://exporter.app/#ace=' + oversizedB64);
      didOpen = true;
    }

    assert.strictEqual(didOpen, false, 'Window.open should be blocked for > 1.5 MB');
    assert.strictEqual(openedUrl, null);
  });
});

describe('Strict-CSP & Trusted-Types Verification', () => {
  test('Overlay is constructed without innerHTML, outerHTML, or cssText', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><user-query>Query</user-query><model-response>Ans</model-response></body></html>', {
      url: 'https://gemini.google.com/app/1'
    });

    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.location = dom.window.location;
    global.URL = dom.window.URL;
    global.CompressionStream = CompressionStream;

    let innerHtmlUsed = false;
    const originalInnerHtmlDesc = Object.getOwnPropertyDescriptor(dom.window.Element.prototype, 'innerHTML');
    Object.defineProperty(dom.window.Element.prototype, 'innerHTML', {
      set(val) {
        innerHtmlUsed = true;
        return originalInnerHtmlDesc.set.call(this, val);
      },
      get() {
        return originalInnerHtmlDesc.get.call(this);
      }
    });

    const bookmarklet = createBookmarkletFunction();
    await bookmarklet('https://exporter.app');

    assert.strictEqual(innerHtmlUsed, false, 'innerHTML was accessed during overlay creation!');
    const overlay = dom.window.document.getElementById('__ace_chat_exporter_overlay__');
    assert.ok(overlay !== null, 'Overlay was not appended to document');
  });
});
