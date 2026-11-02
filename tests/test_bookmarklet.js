/* tests/test_bookmarklet.js: Unit tests for bookmarklet adapters, DOM converter, compression and oversized payloads */
const { JSDOM } = require('jsdom');

function createBookmarkletFunction() {
  return function bookmarklet(APP) {
    /* Self-contained Chat Context Exporter Bookmarklet */
    var ID = '__ace_chat_exporter_overlay__';

    function st(e, s) {
      if (e && s) {
        for (var p in s) {
          if (Object.prototype.hasOwnProperty.call(s, p)) e.style[p] = s[p];
        }
      }
    }

    function mk(t, s, p, txt) {
      var e = document.createElement(t);
      st(e, s);
      if (txt !== undefined && txt !== null) e.textContent = txt;
      if (p) p.appendChild(e);
      return e;
    }

    function skip(n) {
      if (!n || n.nodeType !== 1) return false;
      var tag = n.tagName.toUpperCase();
      if (/^(BUTTON|SVG|INPUT|SELECT|TEXTAREA|SCRIPT|STYLE|NOSCRIPT|NAV|HEADER|FOOTER|FORM)$/.test(tag)) return true;
      var c = (typeof n.className === 'string' ? n.className : '') + ' ' + (n.getAttribute && n.getAttribute('data-testid') || '');
      if (/sr-only|visually-hidden|thinking|thought|tool-|action-bar|copy-button|feedback/i.test(c)) return true;
      return !!(n.getAttribute && n.getAttribute('aria-hidden') === 'true' && (!n.textContent || !n.textContent.trim()));
    }

    function domToMarkdown(n) {
      if (!n) return '';
      function ch(p, ctx) {
        var o = '';
        for (var c = p.firstChild; c; c = c.nextSibling) o += w(c, ctx);
        return o;
      }
      function tbl(t) {
        var trs = t.querySelectorAll('tr');
        if (!trs.length) return '';
        var rows = Array.from(trs).map(function(tr) {
          return Array.from(tr.querySelectorAll('th, td')).map(function(c) {
            return (c.textContent || '').replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|').trim();
          });
        }), mc = Math.max.apply(null, rows.map(function(r) { return r.length; }));
        if (!mc) return '';
        var head = rows[0], sep = Array(mc).fill('---');
        while (head.length < mc) head.push('');
        var out = '\n\n| ' + head.join(' | ') + ' |\n| ' + sep.join(' | ') + ' |\n';
        for (var i = 1; i < rows.length; i++) {
          while (rows[i].length < mc) rows[i].push('');
          out += '| ' + rows[i].join(' | ') + ' |\n';
        }
        return out + '\n';
      }
      function w(node, ctx) {
        if (!node) return '';
        if (node.nodeType === 3) return node.nodeValue;
        if (node.nodeType !== 1 || skip(node)) return '';
        var tag = node.tagName.toUpperCase();
        if (tag === 'PRE') {
          var ce = node.querySelector('code') || node;
          var lm = (typeof ce.className === 'string' ? ce.className : '').match(/(?:language|lang)-([a-zA-Z0-9_-]+)/);
          var lang = lm ? lm[1] : (ce.getAttribute('data-language') || '');
          return '\n\n```' + lang + '\n' + (ce.textContent || '').replace(/\r\n/g, '\n').replace(/\n+$/, '') + '\n```\n\n';
        }
        if (tag === 'CODE') return '`' + (node.textContent || '').trim() + '`';
        if (/^H[1-6]$/.test(tag)) return '\n\n' + '#'.repeat(parseInt(tag[1], 10)) + ' ' + ch(node, ctx).trim() + '\n\n';
        if (tag === 'STRONG' || tag === 'B') {
          var b = ch(node, ctx).trim();
          return b ? ('**' + b + '**') : '';
        }
        if (tag === 'EM' || tag === 'I') {
          var it = ch(node, ctx).trim();
          return it ? ('*' + it + '*') : '';
        }
        if (tag === 'A') {
          var h = node.getAttribute('href') || '', t = ch(node, ctx).trim();
          return h && t ? ('[' + t + '](' + h + ')') : (t || h);
        }
        if (tag === 'BLOCKQUOTE') {
          return '\n\n' + ch(node, ctx).trim().split('\n').map(function(l) { return '> ' + l; }).join('\n') + '\n\n';
        }
        if (tag === 'BR') return '\n';
        if (tag === 'P') {
          var pt = ch(node, ctx).trim();
          return pt ? ('\n\n' + pt + '\n\n') : '';
        }
        if (tag === 'UL' || tag === 'OL') {
          var isOl = (tag === 'OL'), d = (ctx && ctx.d) || 0, ind = '  '.repeat(d), items = [], cnt = 1;
          for (var c = node.firstChild; c; c = c.nextSibling) {
            if (c.nodeType === 1 && c.tagName === 'LI') {
              items.push(ind + (isOl ? (cnt++ + '. ') : '- ') + ch(c, { d: d + 1 }).trim());
            }
          }
          return '\n\n' + items.join('\n') + '\n\n';
        }
        if (tag === 'TABLE') return tbl(node);
        var inn = ch(node, ctx);
        return (tag === 'DIV' || tag === 'SECTION' || tag === 'ARTICLE') ? ('\n' + inn + '\n') : inn;
      }
      return w(n, { d: 0 }).replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    async function autoScroll() {
      var de = document.scrollingElement || document.documentElement || document.body;
      var cs = [document.querySelector('main'), document.querySelector('[class*="react-scroll"]'), de], t = de;
      for (var i = 0; i < cs.length; i++) {
        if (cs[i] && cs[i].scrollHeight > cs[i].clientHeight + 100) { t = cs[i]; break; }
      }
      var orig = t.scrollTop, tot = t.scrollHeight;
      for (var s = 0; s <= 6; s++) {
        t.scrollTop = Math.floor((tot * s) / 6);
        await new Promise(function(r) { setTimeout(r, 200); });
      }
      t.scrollTop = orig;
    }

    async function compressGzipBase64Url(str) {
      var cs = new CompressionStream('gzip'), w = cs.writable.getWriter();
      w.write(new TextEncoder().encode(str));
      w.close();
      var b = new Uint8Array(await new Response(cs.readable).arrayBuffer()), bin = '', ck = 8192;
      for (var i = 0; i < b.length; i += ck) {
        bin += String.fromCharCode.apply(null, b.subarray(i, i + ck));
      }
      return btoa(bin).replace(/\+/g, '-').replace(/\x2F/g, '_').replace(/=+$/, '');
    }

    function extractTurns(tagged, tl) {
      tagged.sort(function(x, y) { return (x.el.compareDocumentPosition(y.el) & 4) ? -1 : 1; });
      var turns = [];
      for (var i = 0; i < tagged.length; i++) {
        var nest = false;
        for (var j = 0; j < tagged.length; j++) {
          if (j !== i && tagged[j].el.contains(tagged[i].el)) { nest = true; break; }
        }
        if (!nest) {
          var txt = tl.domToMarkdown(tagged[i].el);
          if (txt) turns.push({ role: tagged[i].role, text: txt });
        }
      }
      return turns;
    }

    function getTurns(uSel, aSel, rep, tl) {
      var us = Array.from(document.querySelectorAll(uSel)), as = Array.from(document.querySelectorAll(aSel));
      if (!us.length) rep.unmatched_selectors.push(uSel);
      if (!as.length) rep.unmatched_selectors.push(aSel);
      var tg = [];
      for (var i = 0; i < us.length; i++) tg.push({ el: us[i], role: 'user' });
      for (var j = 0; j < as.length; j++) tg.push({ el: as[j], role: 'assistant' });
      return extractTurns(tg, tl);
    }

    var ADAPTERS = [
      {
        name: 'claude',
        match: function(u) { return /(^|\.)claude\.ai$/.test(u.hostname); },
        selectors: { user: '[data-testid="user-message"]', assistant: '.font-claude-response, [data-testid="assistant-message"]' },
        capture: async function(u, rep, tl) {
          var sm = u.pathname.match(/\/share\/([0-9a-fA-F-]{36})/);
          if (sm) {
            try {
              var res = await fetch('/api/chat_snapshots/' + sm[1] + '?rendering_mode=messages&render_all_tools=true', { credentials: 'omit' });
              if (res.ok) {
                var sj = await res.json(), ms = sj.chat_messages || sj.messages;
                if (Array.isArray(ms) && ms.length) {
                  rep.method = 'snapshot';
                  var uc = 0, ac = 0, tc = 0;
                  for (var i = 0; i < ms.length; i++) {
                    var snd = String(ms[i].sender || ms[i].role || '').toLowerCase();
                    if (snd === 'human' || snd === 'user') uc++; else ac++;
                    var tx = ms[i].text || '';
                    if (!tx && Array.isArray(ms[i].content)) {
                      for (var c = 0; c < ms[i].content.length; c++) {
                        if (ms[i].content[c] && ms[i].content[c].text) tx += ms[i].content[c].text;
                      }
                    }
                    tc += tx.length;
                  }
                  rep.user_count = uc; rep.assistant_count = ac; rep.total_messages = ms.length; rep.total_chars = tc;
                  return { v: 1, provider: 'claude', url: u.href, title: sj.name || sj.title || document.title || 'Claude Chat', snapshot: sj, diagnostics: rep };
                }
              }
            } catch (e) {
              rep.warnings.push('Snapshot API fetch failed (' + (e.message || 'error') + '). Using DOM.');
            }
          }
          rep.method = 'dom';
          return { v: 1, provider: 'claude', url: u.href, title: document.title || 'Claude Chat', messages: getTurns(this.selectors.user, this.selectors.assistant, rep, tl), diagnostics: rep };
        }
      },
      {
        name: 'chatgpt',
        match: function(u) { return /(^|\.)(chatgpt\.com|chat\.openai\.com)$/.test(u.hostname); },
        selectors: { turn: '[data-message-author-role]' },
        capture: async function(u, rep, tl) {
          rep.method = 'dom';
          var ts = Array.from(document.querySelectorAll(this.selectors.turn));
          if (!ts.length) rep.unmatched_selectors.push(this.selectors.turn);
          var tg = [];
          for (var i = 0; i < ts.length; i++) {
            var b = ts[i].querySelector('.markdown') || ts[i].querySelector('.whitespace-pre-wrap') || ts[i];
            tg.push({ el: b, role: ts[i].getAttribute('data-message-author-role') === 'assistant' ? 'assistant' : 'user' });
          }
          return { v: 1, provider: 'chatgpt', url: u.href, title: document.title || 'ChatGPT Chat', messages: extractTurns(tg, tl), diagnostics: rep };
        }
      },
      {
        name: 'gemini',
        match: function(u) { return /(^|\.)gemini\.google\.com$/.test(u.hostname); },
        selectors: { user: 'user-query, [data-test-id="user-query"]', assistant: 'model-response, [data-test-id="model-response"]' },
        capture: async function(u, rep, tl) {
          rep.method = 'dom';
          return { v: 1, provider: 'gemini', url: u.href, title: document.title || 'Gemini Chat', messages: getTurns(this.selectors.user, this.selectors.assistant, rep, tl), diagnostics: rep };
        }
      },
      {
        name: 'grok',
        match: function(u) { return /(^|\.)(grok\.com|x\.com)$/.test(u.hostname); },
        selectors: { turn: '[data-testid="message"], div[class*="message"]' },
        capture: async function(u, rep, tl) {
          rep.method = 'dom';
          var ts = Array.from(document.querySelectorAll(this.selectors.turn)), tg = [];
          for (var i = 0; i < ts.length; i++) {
            var ra = (ts[i].getAttribute('data-author') || ts[i].getAttribute('data-role') || '').toLowerCase();
            tg.push({ el: ts[i], role: (ra.indexOf('assistant') !== -1 || ra.indexOf('model') !== -1 || i % 2 === 1) ? 'assistant' : 'user' });
          }
          var turns = extractTurns(tg, tl);
          if (!turns.length) {
            rep.unmatched_selectors.push(this.selectors.turn);
            rep.warnings.push('Could not identify speaker roles; captured page content as one message.');
            var me = document.querySelector('main') || document.querySelector('article') || document.body;
            turns = [{ role: 'user', text: tl.domToMarkdown(me) || 'No readable chat content.' }];
          }
          return { v: 1, provider: 'grok', url: u.href, title: document.title || 'Grok Chat', messages: turns, diagnostics: rep };
        }
      }
    ];

    function showOverlay(appUrl, payload, tl) {
      var old = document.getElementById(ID);
      if (old && old.parentNode) old.parentNode.removeChild(old);

      var dg = payload.diagnostics || {}, pn = (payload.provider || 'AI').toUpperCase();
      var mc = (typeof dg.total_messages === 'number') ? dg.total_messages : (payload.messages ? payload.messages.length : 0);

      var ov = mk('div', {
        position: 'fixed', top: '16px', right: '16px', width: '360px', maxWidth: 'calc(100vw - 32px)',
        backgroundColor: '#0d1422', color: '#f1f5ff', border: '1px solid #253149', borderRadius: '14px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.65)', padding: '16px', zIndex: '2147483647',
        fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '13px', lineHeight: '1.5'
      }, document.body);
      ov.id = ID;

      var cl = mk('button', {
        position: 'absolute', top: '10px', right: '12px', background: 'none', border: 'none',
        color: '#9aa8c0', fontSize: '20px', cursor: 'pointer', padding: '2px 6px', lineHeight: '1'
      }, ov, '×');
      cl.addEventListener('click', function() { if (ov.parentNode) ov.parentNode.removeChild(ov); });

      mk('div', { fontWeight: '700', fontSize: '14px', color: '#fff', paddingRight: '20px', marginBottom: '4px' }, ov, 'Captured ' + mc + ' messages from ' + pn);
      var ml = (dg.method === 'snapshot') ? 'Snapshot' : 'DOM';
      mk('div', { fontSize: '11px', color: '#9aa8c0', marginBottom: '10px' }, ov, ml + ' · ' + (dg.user_count||0) + ' user, ' + (dg.assistant_count||0) + ' assistant · ' + (dg.total_chars||0).toLocaleString() + ' chars');

      var ws = dg.warnings || [];
      if (ws.length) {
        var wb = mk('div', { backgroundColor: 'rgba(255,127,136,0.12)', border: '1px solid rgba(255,127,136,0.35)', borderRadius: '8px', padding: '6px 8px', fontSize: '11px', color: '#ffc7cb', marginBottom: '10px' }, ov);
        for (var w = 0; w < ws.length; w++) mk('div', null, wb, '⚠ ' + ws[w]);
      }
      if (dg.unmatched_selectors && dg.unmatched_selectors.length) {
        mk('div', { fontSize: '10px', color: '#71809a', marginBottom: '10px' }, ov, 'Unmatched: ' + dg.unmatched_selectors.join(', '));
      }

      var alb = mk('div', { display: 'none', fontSize: '11px', borderRadius: '8px', padding: '6px 8px', marginBottom: '10px' }, ov);
      var rw = mk('div', { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }, ov);

      function addBtn(lbl, bg, fn) {
        var b = mk('button', {
          flex: bg ? '1 1 100%' : '1 1 auto', padding: bg ? '10px 14px' : '8px 10px', borderRadius: '8px',
          border: bg ? 'none' : '1px solid #253149', background: bg || '#141d30', color: bg ? '#fff' : '#cdd7e9',
          fontWeight: bg ? '600' : 'normal', cursor: 'pointer', fontSize: bg ? '12px' : '11px'
        }, rw, lbl);
        b.addEventListener('click', fn);
        return b;
      }

      var bo, bc, bd;
      bo = addBtn('Open in Context Exporter', 'linear-gradient(135deg, #7657ff, #4f90ff)', async function() {
        bo.textContent = 'Compressing…'; bo.disabled = true;
        try {
          var enc = await tl.compressGzipBase64Url(JSON.stringify(payload));
          if (enc.length > 1500000) {
            alb.textContent = 'Compressed chat is over 1.5 MB (exceeds URL limit). Please use [Download .json] below and load the file into Context Exporter.';
            st(alb, { display: 'block', backgroundColor: 'rgba(255,127,136,0.15)', border: '1px solid #ff7f88', color: '#ffc7cb' });
            bo.textContent = 'Payload too large for URL';
            st(bd, { boxShadow: '0 0 0 2px #55d39a' });
            return;
          }
          window.open(appUrl + '/#ace=' + enc, '_blank');
          bo.textContent = 'Opened in new tab!';
          setTimeout(function() { bo.textContent = 'Open in Context Exporter'; bo.disabled = false; }, 3000);
        } catch (e) {
          alb.textContent = 'Transfer error: ' + (e.message || 'compression error');
          st(alb, { display: 'block', backgroundColor: 'rgba(255,127,136,0.15)', border: '1px solid #ff7f88', color: '#ffc7cb' });
          bo.textContent = 'Open in Context Exporter'; bo.disabled = false;
        }
      });

      bc = addBtn('Copy as text', null, async function() {
        var txt = '';
        if (payload.messages && payload.messages.length) {
          txt = payload.messages.map(function(m) { return (m.role === 'user' ? 'User:' : 'Assistant:') + '\n' + m.text; }).join('\n\n');
        } else {
          txt = JSON.stringify(payload.snapshot || payload, null, 2);
        }
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(txt);
          else {
            var ta = document.createElement('textarea');
            ta.value = txt; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
          }
          bc.textContent = 'Copied!';
          setTimeout(function() { bc.textContent = 'Copy as text'; }, 2000);
        } catch (_) { bc.textContent = 'Copy failed'; }
      });

      bd = addBtn('Download .json', null, function() {
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), u = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = u; a.download = 'chat-context-' + (payload.provider || 'chat') + '-' + Date.now() + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(u);
        bd.textContent = 'Downloaded!';
        setTimeout(function() { bd.textContent = 'Download .json'; }, 2000);
      });

      return ov;
    }

    async function run() {
      var u = new URL(location.href), adp = null;
      for (var i = 0; i < ADAPTERS.length; i++) {
        if (ADAPTERS[i].match(u)) { adp = ADAPTERS[i]; break; }
      }
      if (!adp) {
        adp = {
          name: 'generic',
          capture: async function(uri, rep, tl) {
            rep.method = 'dom'; rep.warnings.push('Unknown provider (' + uri.hostname + '); captured page text as one message.');
            var me = document.querySelector('main') || document.querySelector('article') || document.body;
            return { v: 1, provider: 'generic', url: uri.href, title: document.title || 'Chat Export', messages: [{ role: 'user', text: tl.domToMarkdown(me) || 'No readable chat content.' }], diagnostics: rep };
          }
        };
      }
      var rep = { provider: adp.name, method: 'dom', user_count: 0, assistant_count: 0, total_messages: 0, total_chars: 0, warnings: [], unmatched_selectors: [] };
      var tl = { domToMarkdown: domToMarkdown, compressGzipBase64Url: compressGzipBase64Url };
      try { await autoScroll(); } catch (_) {}
      var payload;
      try { payload = await adp.capture(u, rep, tl); } catch (e) {
        rep.warnings.push('Capture failed: ' + (e.message || 'error'));
        payload = { v: 1, provider: adp.name, url: u.href, title: document.title || 'Chat', messages: [{ role: 'user', text: 'Error.' }], diagnostics: rep };
      }
      if (payload.messages && Array.isArray(payload.messages)) {
        var tot = 0;
        for (var k = 0; k < payload.messages.length; k++) tot += (payload.messages[k].text || '').length;
        if (tot > 3000000) {
          var tr = [], runC = 0;
          for (var t = payload.messages.length - 1; t >= 0; t--) {
            var len = (payload.messages[t].text || '').length;
            if (runC + len > 3000000 && tr.length > 0) break;
            runC += len; tr.unshift(payload.messages[t]);
          }
          payload.messages = tr;
          rep.warnings.push('Total text exceeded 3,000,000 characters; older messages were trimmed to fit.');
        }
        var uc = 0, ac = 0, fin = 0;
        for (var f = 0; f < payload.messages.length; f++) {
          if (payload.messages[f].role === 'user') uc++; else ac++;
          fin += (payload.messages[f].text || '').length;
        }
        rep.user_count = uc; rep.assistant_count = ac; rep.total_messages = payload.messages.length; rep.total_chars = fin;
      }
      payload.diagnostics = rep;
      showOverlay(APP, payload, tl);
      return payload;
    }

    return run();
  };
}

module.exports = { createBookmarkletFunction };
