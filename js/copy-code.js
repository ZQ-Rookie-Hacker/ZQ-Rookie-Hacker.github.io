/**
 * 代码块增强：macOS 窗口风格 + 复制按钮 + 滚动提示 + 语言标签
 */
(function () {
  'use strict';

  var SVG_COPY =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
    '</svg>';

  var SVG_CHECK =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<polyline points="20 6 9 17 4 12"/>' +
    '</svg>';

  var LANG_COLORS = {
    javascript: '#f7df1e', js: '#f7df1e', typescript: '#3178c6', ts: '#3178c6',
    python: '#3572a5', py: '#3572a5',
    java: '#b07219',
    go: '#00add8', golang: '#00add8',
    rust: '#dea584', rs: '#dea584',
    ruby: '#701516', rb: '#701516',
    php: '#4f5d95',
    c: '#555555', cpp: '#f34b7d', 'c++': '#f34b7d',
    csharp: '#178600', 'c#': '#178600',
    swift: '#f05138',
    kotlin: '#a97bff', kt: '#a97bff',
    scala: '#c22d40',
    shell: '#89e051', bash: '#89e051', sh: '#89e051', zsh: '#89e051',
    powershell: '#012456', ps1: '#012456',
    sql: '#e38c00',
    html: '#e34c26',
    xml: '#0060ac',
    css: '#563d7c', scss: '#c6538c', less: '#1d365d',
    json: '#292929',
    yaml: '#cb171e', yml: '#cb171e',
    markdown: '#083fa1', md: '#083fa1',
    lua: '#000080',
    r: '#198ce7',
    perl: '#0298c3', pl: '#0298c3',
    haskell: '#5e5086', hs: '#5e5086',
    elixir: '#6e4a7e', ex: '#6e4a7e',
    dockerfile: '#384d54', docker: '#384d54',
    makefile: '#427819', make: '#427819',
    vim: '#199f4b', viml: '#199f4b',
    nginx: '#009639',
    ini: '#d1dae3', toml: '#9c4221',
    diff: '#e6cd69',
    plaintext: '#666', text: '#666'
  };

  function getLanguage(figure) {
    var cls = figure.className.split(/\s+/);
    for (var i = 0; i < cls.length; i++) {
      if (cls[i] !== 'highlight' && cls[i] !== 'code-enhanced' && cls[i] !== '') {
        return cls[i].toLowerCase();
      }
    }
    return '';
  }

  function getCodeText(figure) {
    // 有 table 的结构（旧版带行号）
    var codeCol = figure.querySelector('td.code');
    if (codeCol) return codeCol.textContent;
    // 无行号结构：直接取 pre 或 code
    var code = figure.querySelector('code');
    if (code) return code.textContent;
    var pre = figure.querySelector('pre');
    return pre ? pre.textContent : '';
  }

  function copyCode(btn, figure) {
    var text = getCodeText(figure);
    if (!text) return;
    text = text.replace(/\n$/, '');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { showSuccess(btn); });
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showSuccess(btn);
    }
  }

  function showSuccess(btn) {
    btn.classList.add('copied');
    btn.innerHTML = SVG_CHECK + '<span>Copied!</span>';
    setTimeout(function () {
      btn.classList.remove('copied');
      btn.innerHTML = SVG_COPY + '<span>Copy</span>';
    }, 2000);
  }

  function restructure(figure) {
    var lang = getLanguage(figure);
    var color = LANG_COLORS[lang] || '';

    // 创建 header
    var header = document.createElement('div');
    header.className = 'code-header';

    // macOS 红黄绿三圆点
    var dots = document.createElement('div');
    dots.className = 'code-dots';
    dots.innerHTML = '<span></span><span></span><span></span>';

    var langLabel = document.createElement('span');
    langLabel.className = 'code-lang';
    langLabel.textContent = lang || 'code';

    var btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.innerHTML = SVG_COPY + '<span>Copy</span>';
    btn.setAttribute('aria-label', 'Copy code');
    btn.setAttribute('title', 'Copy code');

    header.appendChild(dots);
    header.appendChild(langLabel);
    header.appendChild(btn);

    // 创建滚动容器，把代码内容包进去
    var scrollWrap = document.createElement('div');
    scrollWrap.className = 'code-scroll';

    // 右侧渐变遮罩
    var fade = document.createElement('div');
    fade.className = 'code-fade';
    fade.setAttribute('aria-hidden', 'true');

    // 把 figure 里的所有内容（table 或 pre）移入 scrollWrap
    var children = [];
    for (var i = 0; i < figure.childNodes.length; i++) {
      children.push(figure.childNodes[i]);
    }
    for (var j = 0; j < children.length; j++) {
      scrollWrap.appendChild(children[j]);
    }
    scrollWrap.appendChild(fade);

    figure.appendChild(header);
    figure.appendChild(scrollWrap);
    figure.classList.add('code-enhanced');

    // 溢出检测
    function updateFade() {
      var overflow = scrollWrap.scrollWidth > scrollWrap.clientWidth;
      if (!overflow) {
        fade.style.display = 'none';
        return;
      }
      fade.style.display = '';
      var atEnd = scrollWrap.scrollLeft + scrollWrap.clientWidth >= scrollWrap.scrollWidth - 2;
      fade.style.opacity = atEnd ? '0' : '1';
    }

    updateFade();

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateFade, 200);
    });

    scrollWrap.addEventListener('scroll', updateFade);

    return btn;
  }

  function init() {
    var figures = document.querySelectorAll('figure.highlight');
    for (var i = 0; i < figures.length; i++) {
      (function (figure) {
        if (figure.classList.contains('code-enhanced')) return;

        var btn = restructure(figure);
        if (!btn) return;

        btn.addEventListener('click', function (e) {
          e.preventDefault();
          copyCode(btn, figure);
        });
      })(figures[i]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
