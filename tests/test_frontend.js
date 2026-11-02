/* tests/test_frontend.js: Tests for public/index.html UI, bookmarklet generation, and hash import */
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { test, describe } = require('node:test');
const { JSDOM } = require('jsdom');

describe('Frontend public/index.html Integration Tests', () => {
  const htmlPath = path.resolve(__dirname, '../public/index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  test('HTML structure contains tabs in exact order: Browser capture, Paste, Share link', () => {
    const dom = new JSDOM(htmlContent, { runScripts: 'outside-only' });
    const pills = Array.from(dom.window.document.querySelectorAll('#srcPills input[name="src"]'));
    assert.strictEqual(pills.length, 3);
    assert.strictEqual(pills[0].value, 'capture');
    assert.strictEqual(pills[1].value, 'text');
    assert.strictEqual(pills[2].value, 'link');
    assert.ok(pills[0].checked, 'Browser capture should be checked by default');
  });

  test('Bookmarklet link is initialized with a self-contained javascript: href under 15 KB', () => {
    const dom = new JSDOM(htmlContent, {
      url: 'http://localhost:8000/',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.DecompressionStream = DecompressionStream;
        window.CompressionStream = CompressionStream;
        window.Response = Response;
      }
    });

    const link = dom.window.document.getElementById('bookmarkletLink');
    assert.ok(link !== null, 'bookmarkletLink not found in DOM');
    const href = link.getAttribute('href');
    assert.ok(href.startsWith('javascript:('), 'bookmarklet link href must start with javascript:(');
    assert.ok(href.includes('http://localhost:8000'), 'bookmarklet href must embed current origin');

    const byteLen = Buffer.byteLength(href, 'utf8');
    assert.ok(byteLen < 15 * 1024, `Bookmarklet href is ${byteLen} bytes (exceeds 15 KB limit)`);

    /* Check for single line comments // */
    const lines = href.split('\n');
    for (const line of lines) {
      if (/^\/\//.test(line.trim())) {
        assert.fail(`Found single line // comment in bookmarklet href: ${line}`);
      }
    }
  });

  test('Copy script button copies console-ready script with APP origin', async () => {
    const dom = new JSDOM(htmlContent, {
      url: 'https://exporter.example.com/',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.DecompressionStream = DecompressionStream;
        window.CompressionStream = CompressionStream;
        window.Response = Response;
      }
    });

    let copiedText = null;
    dom.window.navigator.clipboard = {
      writeText: async (txt) => { copiedText = txt; }
    };

    const copyBtn = dom.window.document.getElementById('copyScriptBtn');
    assert.ok(copyBtn !== null, 'copyScriptBtn element not found');
    copyBtn.click();

    await new Promise(r => setTimeout(r, 50));
    assert.ok(copiedText !== null, 'Script was not copied');
    assert.ok(copiedText.startsWith('(function bookmarklet(APP)'), 'Copied script format unexpected');
    assert.ok(copiedText.includes('https://exporter.example.com'), 'Copied script should include origin');
  });

  test('#ace= hash import: decodes, fills textarea, switches tab, displays message, and clears hash without auto-submitting', async () => {
    /* 1. Prepare sample payload */
    const samplePayload = {
      v: 1,
      provider: 'claude',
      title: 'Neural Networks Discussion',
      messages: [
        { role: 'user', text: 'Explain backpropagation' },
        { role: 'assistant', text: 'Backpropagation computes the gradient...' }
      ],
      diagnostics: {
        provider: 'claude',
        method: 'dom',
        user_count: 1,
        assistant_count: 1,
        total_messages: 2,
        total_chars: 70
      }
    };

    /* 2. Gzip compress and base64url encode */
    const jsonStr = JSON.stringify(samplePayload);
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(jsonStr));
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    }
    const b64url = btoa(bin).replace(/\+/g, '-').replace(/\x2F/g, '_').replace(/=+$/, '');

    /* 3. Load JSDOM with hash in URL and web streams attached */
    const dom = new JSDOM(htmlContent, {
      url: 'http://localhost:8000/#ace=' + b64url,
      runScripts: 'dangerously',
      beforeParse(window) {
        window.DecompressionStream = DecompressionStream;
        window.CompressionStream = CompressionStream;
        window.Response = Response;
      }
    });

    /* Give async handleUrlImport() a moment to run */
    await new Promise(r => setTimeout(r, 100));

    /* 4. Verify textarea has imported JSON */
    const textArea = dom.window.document.getElementById('text');
    assert.strictEqual(textArea.value, jsonStr);

    /* 5. Verify source radio switched to "text" */
    const textRadio = dom.window.document.querySelector('input[name="src"][value="text"]');
    assert.strictEqual(textRadio.checked, true, 'Source mode was not switched to text');

    /* 6. Verify success banner message was shown */
    const msgEl = dom.window.document.getElementById('msg');
    assert.ok(msgEl.textContent.includes('Imported 2 messages from Claude'));
    assert.ok(msgEl.textContent.includes('Neural Networks Discussion'));

    /* 7. Verify hash was cleared from window.location */
    assert.strictEqual(dom.window.location.hash, '', 'Hash was not cleared');

    /* 8. Verify it did NOT auto-submit */
    const btn = dom.window.document.getElementById('submit');
    assert.strictEqual(btn.disabled, false, 'Submit button should remain enabled and not submitting');
  });
});
