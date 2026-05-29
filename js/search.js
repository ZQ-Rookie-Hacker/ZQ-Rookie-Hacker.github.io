/**
 * Improved Local Search for Freemind.bithack Theme
 * Features:
 * - Modal overlay with full-width search input
 * - Instant keyword matching with relevance ranking
 * - Keyboard navigation (↑↓ Enter Esc)
 * - Click-outside-to-close
 * - Debounced input for performance
 * - Content snippet with highlighted matches
 * - Ctrl+K shortcut to open
 * - Hidden posts excluded at index generation time
 */
(function () {
  'use strict';

  var searchData = null;       // cached search entries
  var overlay = null;          // overlay DOM
  var inputEl = null;          // search input
  var resultEl = null;         // results container
  var selectedIdx = -1;        // current keyboard selection
  var visibleResults = [];     // currently filtered/matching entries
  var debounceTimer = null;

  // ---------- DOM Builder ----------

  function buildOverlay() {
    var wrap = document.createElement('div');
    wrap.id = 'search-overlay';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Search');

    // Backdrop click → close
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) closeOverlay();
    });

    // Inner container
    var inner = document.createElement('div');
    inner.id = 'search-overlay-inner';

    // Header: input + hint
    var header = document.createElement('div');
    header.id = 'search-overlay-header';

    var inputWrap = document.createElement('div');
    inputWrap.id = 'search-input-wrap';

    var icon = document.createElement('span');
    icon.id = 'search-input-icon';
    icon.innerHTML = '&#x1F50D;'; // magnifying glass
    inputWrap.appendChild(icon);

    var input = document.createElement('input');
    input.type = 'text';
    input.id = 'search-overlay-input';
    input.setAttribute('placeholder', 'Search articles...');
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('spellcheck', 'false');
    inputWrap.appendChild(input);

    var hint = document.createElement('span');
    hint.id = 'search-hint';
    hint.textContent = 'ESC to close';
    inputWrap.appendChild(hint);

    header.appendChild(inputWrap);
    inner.appendChild(header);

    // Status line
    var status = document.createElement('div');
    status.id = 'search-status';
    inner.appendChild(status);

    // Results list
    var results = document.createElement('div');
    results.id = 'search-overlay-results';
    inner.appendChild(results);

    // Footer
    var footer = document.createElement('div');
    footer.id = 'search-footer';
    footer.innerHTML = '<span>↑↓ Navigate</span><span>⏎ Open</span><span>Esc Close</span>';
    inner.appendChild(footer);

    wrap.appendChild(inner);
    document.body.appendChild(wrap);

    overlay = wrap;
    inputEl = input;
    resultEl = results;

    // Input events
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    // ESC on document
    document.addEventListener('keydown', onGlobalKeydown);
  }

  // ---------- Overlay Show/Hide ----------

  function openOverlay() {
    if (!overlay) buildOverlay();
    overlay.classList.add('active');
    inputEl.value = '';
    inputEl.focus();
    resultEl.innerHTML = '';
    document.getElementById('search-status').textContent = '';
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

  // ---------- Data Loading ----------

  function loadData(callback) {
    if (searchData) return callback();

    // Use global path set by after_footer.ejs
    var url = (typeof searchPath !== 'undefined' && searchPath) ? searchPath : '/search.xml';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          var xml = xhr.responseXML;
          if (!xml) {
            // Fallback: parse as text
            var parser = new DOMParser();
            xml = parser.parseFromString(xhr.responseText, 'text/xml');
          }
          var entries = xml.getElementsByTagName('entry');
          searchData = [];
          for (var i = 0; i < entries.length; i++) {
            var entry = entries[i];
            var title = getText(entry, 'title');
            var content = getText(entry, 'content');
            var url = getText(entry, 'url');
            // Strip HTML tags from content for clean matching and snippet extraction
            var plainContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            searchData.push({
              title: title,
              content: plainContent,
              url: url
            });
          }
          callback();
        } else {
          document.getElementById('search-status').textContent = 'Search index failed to load.';
        }
      }
    };
    xhr.send();
  }

  function getText(parent, tagName) {
    var el = parent.getElementsByTagName(tagName)[0];
    return el ? (el.textContent || el.innerText || '') : '';
  }

  // ---------- Search Logic ----------

  function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(performSearch, 200);
  }

  function performSearch() {
    var query = inputEl.value.trim();
    var statusEl = document.getElementById('search-status');
    selectedIdx = -1;
    visibleResults = [];

    if (!query) {
      resultEl.innerHTML = '';
      statusEl.textContent = '';
      return;
    }

    if (!searchData) {
      statusEl.textContent = 'Loading...';
      loadData(function () {
        performSearch();
      });
      return;
    }

    var keywords = query.toLowerCase().split(/[\s\-]+/).filter(Boolean);

    // Score each entry
    var scored = [];
    searchData.forEach(function (entry, idx) {
      var titleLower = entry.title.toLowerCase();
      var contentLower = entry.content.toLowerCase();
      var score = 0;
      var titleMatches = [];
      var contentMatches = [];

      keywords.forEach(function (kw) {
        var ti = titleLower.indexOf(kw);
        if (ti !== -1) {
          score += 10; // title match is heavily weighted
          titleMatches.push(kw);
        }
        var ci = contentLower.indexOf(kw);
        if (ci !== -1) {
          score += 1; // content match has lower weight
          contentMatches.push(kw);
        }
      });

      if (score > 0) {
        var firstContentPos = -1;
        keywords.forEach(function (kw) {
          var pos = contentLower.indexOf(kw);
          if (pos !== -1 && (firstContentPos === -1 || pos < firstContentPos)) {
            firstContentPos = pos;
          }
        });

        scored.push({
          entry: entry,
          score: score,
          titleMatches: titleMatches,
          contentMatches: contentMatches,
          firstContentPos: firstContentPos,
          idx: idx
        });
      }
    });

    // Sort: higher score first, then title matches as tiebreaker
    scored.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      // Prefer title matches
      if (a.titleMatches.length > 0 && b.titleMatches.length === 0) return -1;
      if (b.titleMatches.length > 0 && a.titleMatches.length === 0) return 1;
      return 0;
    });

    visibleResults = scored;

    if (!scored.length) {
      statusEl.textContent = 'No results found for "' + query + '"';
      resultEl.innerHTML = '';
      return;
    }

    statusEl.textContent = scored.length + ' result' + (scored.length > 1 ? 's' : '') + ' found';
    renderResults(scored);
  }

  // ---------- Rendering ----------

  function renderResults(scored) {
    var html = '<ul id="search-result-list">';
    scored.forEach(function (item, listIdx) {
      var entry = item.entry;
      var snippet = buildSnippet(entry.content, item.firstContentPos, item.contentMatches.concat(item.titleMatches));

      // Highlight title
      var titleHtml = escapeHtml(entry.title);
      item.titleMatches.forEach(function (kw) {
        titleHtml = highlightText(titleHtml, kw);
      });

      html += '<li class="search-result-item' + (listIdx === 0 ? ' selected' : '') + '" data-url="' + escapeAttr(entry.url) + '" data-idx="' + listIdx + '">';
      html += '<a class="search-result-title" href="' + escapeAttr(entry.url) + '">' + titleHtml + '</a>';
      if (snippet) {
        // Highlight keywords in snippet
        var snippetHtml = escapeHtml(snippet);
        item.contentMatches.forEach(function (kw) {
          snippetHtml = highlightText(snippetHtml, kw);
        });
        html += '<p class="search-result-snippet">' + snippetHtml + '</p>';
      }
      html += '<span class="search-result-url">' + escapeHtml(entry.url) + '</span>';
      html += '</li>';
    });
    html += '</ul>';
    resultEl.innerHTML = html;
    selectedIdx = 0;

    // Bind click/hover on result items
    var items = resultEl.querySelectorAll('.search-result-item');
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        item.addEventListener('mouseenter', function () {
          setSelection(parseInt(item.getAttribute('data-idx')));
        });
        item.addEventListener('click', function (e) {
          // Let the <a> handle navigation naturally if it was clicked
          if (e.target.tagName === 'A') return;
          var a = item.querySelector('a');
          if (a) window.location.href = a.getAttribute('href');
        });
      })(items[i]);
    }
  }

  function buildSnippet(content, firstPos, keywords) {
    if (firstPos < 0) {
      // Use title match only — show beginning of content
      return content.substring(0, 150);
    }
    var start = Math.max(0, firstPos - 40);
    var end = Math.min(content.length, firstPos + 120);
    var snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    return snippet;
  }

  function highlightText(text, keyword) {
    var re = new RegExp('(' + escapeRegex(keyword) + ')', 'gi');
    return text.replace(re, '<em class="search-keyword">$1</em>');
  }

  // ---------- Keyboard Navigation ----------

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOverlay();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (visibleResults.length === 0) return;
      setSelection(Math.min(selectedIdx + 1, visibleResults.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (visibleResults.length === 0) return;
      setSelection(Math.max(selectedIdx - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && selectedIdx < visibleResults.length) {
        var url = visibleResults[selectedIdx].entry.url;
        window.location.href = url;
      }
      return;
    }
  }

  function onGlobalKeydown(e) {
    // Ctrl+K or Cmd+K to open search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openOverlay();
      return;
    }

    // Slash "/" to open search (when not in an input/textarea)
    if (e.key === '/' && !isEditingElement(e.target)) {
      e.preventDefault();
      openOverlay();
      return;
    }
  }

  function isEditingElement(el) {
    if (!el) return false;
    var tag = el.tagName || '';
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
      el.isContentEditable || el.getAttribute('contenteditable') === 'true';
  }

  function setSelection(idx) {
    selectedIdx = idx;
    var items = resultEl.querySelectorAll('.search-result-item');
    for (var i = 0; i < items.length; i++) {
      if (i === idx) {
        items[i].classList.add('selected');
        items[i].scrollIntoView({ block: 'nearest' });
      } else {
        items[i].classList.remove('selected');
      }
    }
  }

  // ---------- Helpers ----------

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ---------- Init: wire up trigger button ----------

  function openSearch() {
    loadData(function () {
      openOverlay();
    });
  }

  function init() {
    // Attach click handler to sidebar search trigger button
    var trigger = document.getElementById('search-trigger-btn');
    if (trigger) {
      trigger.addEventListener('click', function (e) {
        e.preventDefault();
        openSearch();
      });
    }

    // Attach click handler to navbar search button
    var navBtn = document.getElementById('nav-search-btn');
    if (navBtn) {
      navBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openSearch();
      });
    }

    // Also attach to old inline input if it exists (fallback for old layout)
    var oldInput = document.getElementById('local-search-input');
    if (oldInput) {
      oldInput.addEventListener('focus', function (e) {
        e.preventDefault();
        oldInput.blur();
        openSearch();
      });
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
