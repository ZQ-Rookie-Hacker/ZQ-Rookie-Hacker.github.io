/**
 * Local Search for Freemind.bithack Theme
 * Click-to-open section menu per result.
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
  var sectionKeywords = [];
  var activePopup = null;   // currently open popup element
  var activeBtn = null;     // button that opened it

  // ============================================================
  // XML Parsing
  // ============================================================

  function parseXML(text) {
    var list = [];
    var entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    var m;
    while ((m = entryRe.exec(text)) !== null) {
      var block = m[1];
      var title = extractTag(block, 'title');
      var url = extractTag(block, 'url');
      var raw = extractTag(block, 'content');
      if (!title || !url) continue;
      raw = raw.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
      var headings = extractHeadings(raw);
      var plain = raw.replace(/<[^>]*>/g, ' ').replace(/[\s\r\n]+/g, ' ').trim();
      list.push({ title: title, content: plain, url: url, headings: headings });
    }
    return list;
  }

  function extractTag(block, tag) {
    var re = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>', 'i');
    var m = block.match(re);
    return m ? m[1] : '';
  }

  function extractHeadings(html) {
    var headings = [];
    var re = /<h([23])\s[^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h[23]>/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var text = m[3].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      text = decodeEntities(text);
      if (text && m[2]) headings.push({ text: text, id: m[2] });
    }
    return headings;
  }

  function decodeEntities(s) {
    return s.replace(/&#x2F;/g, '/').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCharCode(parseInt(h, 16)); });
  }

  // ============================================================
  // Preload
  // ============================================================

  function preloadData() {
    var url = (typeof searchPath !== 'undefined' && searchPath) ? searchPath : '/search.xml';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status !== 200 && xhr.status !== 304 && xhr.status !== 0) { searchData = []; return; }
      try { searchData = parseXML(xhr.responseText); } catch (e) { searchData = []; }
    };
    xhr.send();
  }

  // ============================================================
  // Overlay DOM
  // ============================================================

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

  // ============================================================
  // Section Popup (click-triggered)
  // ============================================================

  function closePopup() {
    if (activePopup) {
      activePopup.parentNode.removeChild(activePopup);
      activePopup = null;
      activeBtn = null;
    }
  }

  function openPopup(btn, headings, url, keywords) {
    closePopup();

    // Primary keyword for in-page highlight
    var hlWord = keywords.length > 0 ? keywords[0] : '';

    var div = document.createElement('div');
    div.className = 'search-ctx-menu';
    for (var i = 0; i < headings.length; i++) {
      var hd = headings[i];
      var hdHtml = escapeHtml(hd.text);
      for (var k = 0; k < keywords.length; k++) hdHtml = highlightText(hdHtml, keywords[k]);
      var base = url.replace(/\/+$/, '');
      var hlParam = hlWord ? '?hl=' + encodeURIComponent(hlWord) : '';
      var link = base + hlParam + '#' + hd.id;
      var a = document.createElement('a');
      a.className = 'search-ctx-link';
      a.href = link;
      a.target = '_blank';
      a.rel = 'noopener';
      a.innerHTML = hdHtml;
      div.appendChild(a);
    }

    document.body.appendChild(div);
    activePopup = div;
    activeBtn = btn;

    // Position below the button
    var btnRect = btn.getBoundingClientRect();
    var popW = div.offsetWidth;
    var popH = div.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var M = 8;

    var left = btnRect.left;
    if (left + popW > vw - M) left = vw - popW - M;
    if (left < M) left = M;

    var top = btnRect.bottom + 4;
    if (top + popH > vh - M) top = btnRect.top - popH - 4;
    if (top < M) top = M;

    div.style.left = left + 'px';
    div.style.top = top + 'px';

    // Close on click outside
    setTimeout(function () {
      document.addEventListener('click', onDocClick);
    }, 0);
  }

  function onDocClick(e) {
    document.removeEventListener('click', onDocClick);
    if (activePopup && !activePopup.contains(e.target) && e.target !== activeBtn) {
      closePopup();
    }
  }

  // ============================================================
  // Open / Close Overlay
  // ============================================================

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
    closePopup();
    overlay.classList.remove('active');
    document.body.style.overflow = '';
    selectedIdx = -1;
    visibleResults = [];
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  }

  // ============================================================
  // Search
  // ============================================================

  function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 200);
  }

  function performSearch() {
    var query = inputEl.value.trim();
    selectedIdx = -1;
    visibleResults = [];
    closePopup();

    if (!query) { resultEl.innerHTML = ''; if (statusEl) statusEl.textContent = ''; return; }
    if (searchData === null) { if (statusEl) statusEl.textContent = 'Loading…'; return; }
    if (!searchData.length) { if (statusEl) statusEl.textContent = 'Search unavailable.'; return; }

    var keywords = query.toLowerCase().split(/[\s\-]+/).filter(Boolean);
    if (!keywords.length) { resultEl.innerHTML = ''; if (statusEl) statusEl.textContent = ''; return; }
    sectionKeywords = keywords;

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

      if (score > 0) {
        var mhd = [];
        for (var h = 0; h < e.headings.length; h++) {
          var ht = e.headings[h].text.toLowerCase();
          for (var kk = 0; kk < keywords.length; kk++) {
            if (ht.indexOf(keywords[kk]) !== -1) { mhd.push(e.headings[h]); break; }
          }
        }
        scored.push({ entry: e, score: score, matchedKeywords: matched, firstContentPos: fp, matchedHeadings: mhd });
      }
    }

    if (!scored.length) { if (statusEl) statusEl.textContent = 'No results for "' + query + '"'; resultEl.innerHTML = ''; return; }

    scored.sort(function (a, b) { return b.score - a.score; });
    visibleResults = scored;
    if (statusEl) statusEl.textContent = scored.length + ' result' + (scored.length > 1 ? 's' : '');
    renderResults(scored);
  }

  // ============================================================
  // Render
  // ============================================================

  function renderResults(scored) {
    var p = ['<ul id="search-result-list">'];

    for (var i = 0; i < scored.length; i++) {
      var item = scored[i];
      var e = item.entry;
      var snippet = buildSnippet(e.content, item.firstContentPos);

      var th = escapeHtml(e.title);
      for (var k = 0; k < item.matchedKeywords.length; k++) th = highlightText(th, item.matchedKeywords[k]);

      var hasSec = item.matchedHeadings.length > 0;
      p.push('<li class="search-result-item' + (i === 0 ? ' selected' : '') + '" data-url="' + escapeAttr(e.url) + '" data-idx="' + i + '">');

      // Title row
      p.push('<div class="search-result-row">');
      p.push('<a class="search-result-title" href="' + escapeAttr(e.url) + '">' + th + '</a>');
      if (hasSec) {
        p.push('<button type="button" class="search-sec-btn" data-idx="' + i + '" title="Show sections">' + item.matchedHeadings.length + '</button>');
      } else {
        p.push('<a class="search-sec-btn search-sec-goto" href="' + escapeAttr(e.url) + '" title="Go to article">&rarr;</a>');
      }
      p.push('</div>');

      // Snippet
      if (snippet) {
        var sh = escapeHtml(snippet);
        for (var j = 0; j < item.matchedKeywords.length; j++) sh = highlightText(sh, item.matchedKeywords[j]);
        p.push('<p class="search-result-snippet">' + sh + '</p>');
      }

      p.push('</li>');
    }

    p.push('</ul>');
    resultEl.innerHTML = p.join('');
    selectedIdx = 0;
    bindResultItems(scored);
  }

  function bindResultItems(scored) {
    // Result item click / hover
    var items = resultEl.querySelectorAll('.search-result-item');
    for (var i = 0; i < items.length; i++) {
      (function (el, idx) {
        el.addEventListener('mouseenter', function () { setSelection(idx); });
        el.addEventListener('click', function (e) {
          if (e.target.tagName === 'A' || e.target.tagName === 'BUTTON') return;
          var a = el.querySelector('.search-result-title');
          if (a) window.location.href = a.getAttribute('href');
        });
      })(items[i], i);
    }

    // Section buttons
    var btns = resultEl.querySelectorAll('.search-sec-btn');
    for (var b = 0; b < btns.length; b++) {
      (function (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          var idx = parseInt(btn.getAttribute('data-idx'), 10);
          var item = scored[idx];
          if (item && item.matchedHeadings.length > 0) {
            openPopup(btn, item.matchedHeadings, item.entry.url, sectionKeywords);
          }
        });
      })(btns[b]);
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

  // ============================================================
  // Keyboard
  // ============================================================

  function onKeydown(e) {
    var key = e.key || '';
    if (key === 'Escape')       { e.preventDefault(); closePopup(); closeOverlay(); }
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

  // ============================================================
  // Utilities
  // ============================================================

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

  // ============================================================
  // Init
  // ============================================================

  function init() {
    preloadData();
    var btn = document.getElementById('search-trigger-btn');
    if (btn) btn.addEventListener('click', function (e) { e.preventDefault(); openOverlay(); });
    document.addEventListener('keydown', onGlobalKeydown);
  }

  // ============================================================
  // Auto-highlight keyword from ?hl= parameter
  // Runs on every page load — if URL has ?hl=keyword,
  // find the keyword in the article content, scroll to it,
  // highlight it with a pulsing animation, then clean up.
  // ============================================================

  function autoHighlight() {
    var params = window.location.search;
    if (!params || params.indexOf('hl=') === -1) return;

    var match = params.match(/[?&]hl=([^&#]*)/);
    if (!match) return;

    var keyword;
    try { keyword = decodeURIComponent(match[1]); } catch (e) { return; }
    if (!keyword) return;

    // Clean URL (remove ?hl=... without page reload)
    var cleanUrl = window.location.pathname + window.location.hash;
    if (window.history && window.history.replaceState) {
      window.history.replaceState(null, '', cleanUrl);
    }

    // Determine search scope:
    // If URL has #anchor, search within that section only (up to next h2/h3).
    // Otherwise, search the whole article content.
    var anchorId = window.location.hash ? window.location.hash.substring(1) : null;
    var scope = null;

    if (anchorId) {
      // Find the heading with this ID
      var heading = document.getElementById(anchorId);
      if (heading) {
        // Collect all text nodes from this heading until the next h2/h3
        scope = [];
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        var n = heading.firstChild; // start from inside the heading
        var started = false;
        while (n) {
          if (n === heading || heading.contains(n)) { started = true; }
          if (started) {
            // Stop if we hit a sibling h2/h3 (next section)
            if (n.nodeType === 1 && /^H[23]$/i.test(n.tagName) && n !== heading) break;
            if (n.nodeType === 3) scope.push(n);
          }
          // Tree traversal: depth-first
          if (n.firstChild) { n = n.firstChild; }
          else if (n.nextSibling) { n = n.nextSibling; }
          else {
            while (n && !n.nextSibling) { n = n.parentNode; }
            if (n) n = n.nextSibling;
          }
        }
      }
    }

    // Fallback: search whole article
    if (!scope || !scope.length) {
      var contentArea = document.querySelector('.mypage') || document.querySelector('.content') || document.body;
      if (!contentArea) return;
      var w = document.createTreeWalker(contentArea, NodeFilter.SHOW_TEXT, null, false);
      scope = [];
      while (w.nextNode()) scope.push(w.currentNode);
    }

    // Find first text node containing the keyword
    var re = new RegExp(escapeRegex(keyword), 'i');
    var found = null;
    for (var i = 0; i < scope.length; i++) {
      if (scope[i].nodeValue && re.test(scope[i].nodeValue)) { found = scope[i]; break; }
    }
    if (!found) return;

    // Wrap keyword in <mark>
    var idx = found.nodeValue.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx === -1) return;

    var before = found.nodeValue.substring(0, idx);
    var matchText = found.nodeValue.substring(idx, idx + keyword.length);
    var after = found.nodeValue.substring(idx + keyword.length);

    var mark = document.createElement('mark');
    mark.className = 'search-hl-mark';
    mark.appendChild(document.createTextNode(matchText));

    var parent = found.parentNode;
    if (before) parent.insertBefore(document.createTextNode(before), found);
    parent.insertBefore(mark, found);
    if (after) parent.insertBefore(document.createTextNode(after), found);
    parent.removeChild(found);

    // Scroll to the keyword
    setTimeout(function () {
      mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);

    // Remove highlight after 5 seconds
    setTimeout(function () {
      if (mark.parentNode) {
        var text = document.createTextNode(mark.textContent);
        mark.parentNode.replaceChild(text, mark);
        if (text.parentNode) text.parentNode.normalize();
      }
    }, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); autoHighlight(); });
  } else {
    init();
    autoHighlight();
  }
})();
