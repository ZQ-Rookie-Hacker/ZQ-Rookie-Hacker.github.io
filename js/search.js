/**
 * Local Search for Freemind.bithack Theme
 * Regex-based XML parsing — no DOMParser dependency, works everywhere.
 */
(function () {
  'use strict';

  var searchData = null;
  var overlay = null;
  var inputEl = null;
  var resultEl = null;
  var statusEl = null;
  var selectedIdx = -1;
  var visibleResults = [];
  var debounceTimer = null;

  // ---------- Parse search.xml text → array of {title,content,url} ----------

  function parseXML(text) {
    var list = [];
    // Match each <entry>...</entry> block
    var entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    var m;
    while ((m = entryRe.exec(text)) !== null) {
      var block = m[1];
      var title = extractTag(block, 'title');
      var url = extractTag(block, 'url');
      var content = extractTag(block, 'content');
      if (!title || !url) continue;
      // content might be wrapped in CDATA — strip it
      content = content.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
      // Strip HTML tags
      var plain = content.replace(/<[^>]*>/g, ' ').replace(/[\s\r\n]+/g, ' ').trim();
      list.push({ title: title, content: plain, url: url });
    }
    return list;
  }

  function extractTag(block, tag) {
    var re = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>', 'i');
    var m = block.match(re);
    return m ? m[1] : '';
  }

  // ---------- Preload ----------

  function preloadData() {
    var url = (typeof searchPath !== 'undefined' && searchPath) ? searchPath : '/search.xml';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200 && xhr.status !== 304 && xhr.status !== 0) {
        searchData = []; return;
      }
      try {
        searchData = parseXML(xhr.responseText);
      } catch (e) {
        searchData = [];
      }
    };

    xhr.send();
  }

  // ---------- DOM ----------

  function buildOverlay() {
    var wrap = document.createElement('div');
    wrap.id = 'search-overlay';
    wrap.onclick = function (e) { if (e.target === wrap) closeOverlay(); };

    var inner = document.createElement('div');
    inner.id = 'search-overlay-inner';

    var hdr = document.createElement('div');
    hdr.id = 'search-overlay-header';
    var iw = document.createElement('div');
    iw.id = 'search-input-wrap';

    var icon = document.createElement('span');
    icon.id = 'search-input-icon';
    icon.appendChild(document.createTextNode('🔍'));
    iw.appendChild(icon);

    var inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'search-overlay-input';
    inp.placeholder = 'Search articles...';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    iw.appendChild(inp);

    var hint = document.createElement('span');
    hint.id = 'search-hint';
    hint.appendChild(document.createTextNode('ESC to close'));
    iw.appendChild(hint);

    hdr.appendChild(iw);
    inner.appendChild(hdr);

    var st = document.createElement('div');
    st.id = 'search-status';
    inner.appendChild(st);

    var res = document.createElement('div');
    res.id = 'search-overlay-results';
    inner.appendChild(res);

    var foot = document.createElement('div');
    foot.id = 'search-footer';
    foot.appendChild(document.createTextNode('↑↓ Navigate    ⏎ Open    Esc Close'));
    inner.appendChild(foot);

    wrap.appendChild(inner);
    document.body.appendChild(wrap);

    overlay = wrap;
    inputEl = inp;
    resultEl = res;
    statusEl = st;

    inp.addEventListener('input', onInput);
    inp.addEventListener('keydown', onKeydown);
  }

  // ---------- Open / Close ----------

  function openOverlay() {
    if (!document.body) return;
    if (!overlay) buildOverlay();

    overlay.classList.add('active');
    inputEl.value = '';
    inputEl.focus();
    resultEl.innerHTML = '';
    if (statusEl) statusEl.textContent = '';
    selectedIdx = -1;
    visibleResults = [];
    document.body.style.overflow = 'hidden';
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    selectedIdx = -1;
    visibleResults = [];
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  }

  // ---------- Search ----------

  function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 200);
  }

  function performSearch() {
    var query = inputEl.value.trim();
    selectedIdx = -1;
    visibleResults = [];

    if (!query) {
      resultEl.innerHTML = '';
      if (statusEl) statusEl.textContent = '';
      return;
    }

    if (searchData === null) {
      if (statusEl) statusEl.textContent = 'Loading…';
      return;
    }
    if (!searchData.length) {
      if (statusEl) statusEl.textContent = 'Search unavailable.';
      return;
    }

    var keywords = query.toLowerCase().split(/[\s\-]+/).filter(Boolean);
    if (!keywords.length) { resultEl.innerHTML = ''; if (statusEl) statusEl.textContent = ''; return; }

    var scored = [];
    for (var i = 0; i < searchData.length; i++) {
      var e = searchData[i];
      var tl = e.title.toLowerCase();
      var cl = e.content.toLowerCase();
      var score = 0;
      var matched = [];
      var fp = -1;

      for (var k = 0; k < keywords.length; k++) {
        var kw = keywords[k];
        if (tl.indexOf(kw) !== -1) { score += 10; if (matched.indexOf(kw) === -1) matched.push(kw); }
        var cp = cl.indexOf(kw);
        if (cp !== -1) { score += 1; if (matched.indexOf(kw) === -1) matched.push(kw); if (fp === -1 || cp < fp) fp = cp; }
      }
      if (score > 0) scored.push({ entry: e, score: score, matchedKeywords: matched, firstContentPos: fp });
    }

    if (!scored.length) {
      if (statusEl) statusEl.textContent = 'No results for "' + query + '"';
      resultEl.innerHTML = '';
      return;
    }

    scored.sort(function (a, b) { return b.score - a.score; });
    visibleResults = scored;
    if (statusEl) statusEl.textContent = scored.length + ' result' + (scored.length > 1 ? 's' : '');
    renderResults(scored);
  }

  // ---------- Render ----------

  function renderResults(scored) {
    var p = ['<ul id="search-result-list">'];
    for (var i = 0; i < scored.length; i++) {
      var item = scored[i];
      var e = item.entry;
      var snippet = buildSnippet(e.content, item.firstContentPos);
      var th = escapeHtml(e.title);
      for (var k = 0; k < item.matchedKeywords.length; k++) { th = highlightText(th, item.matchedKeywords[k]); }

      p.push('<li class="search-result-item' + (i === 0 ? ' selected' : '') + '" data-url="' + escapeAttr(e.url) + '" data-idx="' + i + '">');
      p.push('<a class="search-result-title" href="' + escapeAttr(e.url) + '">' + th + '</a>');
      if (snippet) {
        var sh = escapeHtml(snippet);
        for (var j = 0; j < item.matchedKeywords.length; j++) { sh = highlightText(sh, item.matchedKeywords[j]); }
        p.push('<p class="search-result-snippet">' + sh + '</p>');
      }
      p.push('<span class="search-result-url">' + escapeHtml(e.url) + '</span>');
      p.push('</li>');
    }
    p.push('</ul>');
    resultEl.innerHTML = p.join('');
    selectedIdx = 0;
    bindResultItems();
  }

  function bindResultItems() {
    var items = resultEl.querySelectorAll('.search-result-item');
    for (var i = 0; i < items.length; i++) {
      (function (el) {
        el.addEventListener('mouseenter', function () { setSelection(parseInt(el.getAttribute('data-idx'), 10)); });
        el.addEventListener('click', function (e) { if (e.target.tagName === 'A') return; var a = el.querySelector('a'); if (a) window.location.href = a.getAttribute('href'); });
      })(items[i]);
    }
  }

  function buildSnippet(content, firstPos) {
    if (firstPos < 0) return content.substring(0, 150);
    var s = Math.max(0, firstPos - 40);
    var e = Math.min(content.length, firstPos + 120);
    var snip = content.substring(s, e);
    if (s > 0) snip = '…' + snip;
    if (e < content.length) snip = snip + '…';
    return snip;
  }

  function highlightText(text, keyword) {
    return text.replace(new RegExp('(' + escapeRegex(keyword) + ')', 'gi'), '<em class="search-keyword">$1</em>');
  }

  // ---------- Keyboard ----------

  function onKeydown(e) {
    var key = e.key || '';
    if (key === 'Escape')     { e.preventDefault(); closeOverlay(); }
    else if (key === 'ArrowDown') { e.preventDefault(); if (visibleResults.length) setSelection(Math.min(selectedIdx + 1, visibleResults.length - 1)); }
    else if (key === 'ArrowUp')   { e.preventDefault(); if (visibleResults.length) setSelection(Math.max(selectedIdx - 1, 0)); }
    else if (key === 'Enter')     { e.preventDefault(); if (selectedIdx >= 0 && selectedIdx < visibleResults.length) window.location.href = visibleResults[selectedIdx].entry.url; }
  }

  function onGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openOverlay(); return; }
    if (e.key === '/' && !isEditingElement(e.target)) { e.preventDefault(); openOverlay(); }
  }

  function isEditingElement(el) {
    if (!el) return false;
    var t = el.tagName || '';
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable || el.getAttribute('contenteditable') === 'true';
  }

  function setSelection(idx) {
    selectedIdx = idx;
    var items = resultEl.querySelectorAll('.search-result-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList[i === idx ? 'add' : 'remove']('selected');
      if (i === idx) items[i].scrollIntoView({ block: 'nearest' });
    }
  }

  // ---------- Utilities ----------

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }
  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ---------- Init ----------

  function init() {
    // Preload — searchPath already defined (script order fixed in after_footer.ejs)
    preloadData();

    // Trigger button
    var btn = document.getElementById('search-trigger-btn');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); openOverlay(); });

    // Global shortcut
    document.addEventListener('keydown', onGlobalKeydown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
