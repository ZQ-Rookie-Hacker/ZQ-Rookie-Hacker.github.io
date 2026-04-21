// 防抖函数
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

document.addEventListener('DOMContentLoaded', function(){
  // 延迟执行，避免阻塞页面渲染
  setTimeout(function(){
    try{
      // Dynamically enable/disable sticky behavior for category-stick based on available viewport
      function updateCategoryStick(){
        var cat = document.querySelector('.category-stick');
        var tocWrapper = document.querySelector('.toc-wrapper');
        if(!cat) return;
        var topCard = document.querySelector('.top-card');
        var topHeight = topCard ? Math.ceil(topCard.getBoundingClientRect().height) + 8 : 68;
        // Desktop only: enable sticky/fixed behavior when viewport allows
        if(window.innerWidth > 979){
          // make category-stick fixed below top-card
          cat.classList.add('fixed');
          cat.style.top = (topHeight + 8) + 'px';
          // set width to match card
          cat.style.width = (topCard ? topCard.getBoundingClientRect().width : 220) + 'px';
          // ensure category-stick fits in viewport, allow internal scroll
          var maxh = window.innerHeight - (topHeight + 20);
          cat.style.maxHeight = maxh + 'px';
          cat.style.overflow = 'auto';
          // do not hide per-article TOC; keep it visible
        } else {
          cat.classList.remove('fixed');
          cat.style.top = '';
          cat.style.width = '';
          cat.style.maxHeight = '';
          cat.style.overflow = '';
        }
      }
      
      // 使用防抖优化resize事件
      var debouncedUpdate = debounce(updateCategoryStick, 100);
      updateCategoryStick();
      window.addEventListener('resize', debouncedUpdate);
      window.addEventListener('orientationchange', debouncedUpdate);

    var toc = document.querySelector('.toc-article');
    if(!toc) return;

    // Limit depth (1 -> h2, 2 -> h3)
    var maxDepth = 2;
    var lis = toc.querySelectorAll('li');
    lis.forEach(function(li){
      var depth = 0;
      var p = li.parentElement;
      while(p && p !== toc){
        if(p.tagName.toLowerCase() === 'li') depth++;
        p = p.parentElement;
      }
      if(depth >= maxDepth){
        // hide deeper items to limit TOC depth
        li.style.display = 'none';
      }
    });

    // Smooth scroll for TOC links with header offset to avoid navigation overlay
    var anchors = toc.querySelectorAll('a');
    // determine header offset: prefer header/.navbar if present
    var headerOffset = 80; // default fallback
    var headerCandidates = ['header', '.navbar', 'nav', '#top_meta'];
    for(var i=0;i<headerCandidates.length;i++){
      var el = document.querySelector(headerCandidates[i]);
      if(el && el.offsetHeight){ headerOffset = el.offsetHeight; break; }
    }

    anchors.forEach(function(a){
      a.addEventListener('click', function(e){
        var href = this.getAttribute('href');
        if(!href || href.indexOf('#') === -1) return;
        var id = href.split('#').pop();
        if(!id) return;
        var target = document.getElementById(decodeURIComponent(id));
        if(target){
          e.preventDefault();
          var rect = target.getBoundingClientRect();
          var absoluteTop = rect.top + window.pageYOffset;
          var scrollTo = Math.max(absoluteTop - headerOffset - 10, 0);
          window.scrollTo({ top: scrollTo, behavior: 'smooth' });
          try{ history.replaceState(null, null, '#'+id); }catch(e){}
        }
      });
    });

    // Active section highlight using IntersectionObserver
    var headingSelector = '.mypage h2, .mypage h3';
    var headings = Array.prototype.slice.call(document.querySelectorAll(headingSelector));
    if(headings.length){
      var idToLink = {};
      anchors.forEach(function(a){
        var href = a.getAttribute('href');
        if(href && href.indexOf('#')!==-1){
          var id = decodeURIComponent(href.split('#').pop());
          idToLink[id] = a;
        }
      });

      // account for header offset when detecting active section
      var options = { root: null, rootMargin: '0px 0px -' + (headerOffset + 100) + 'px 0px', threshold: 0 };
      var observer = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          var id = entry.target.id;
          var link = idToLink[id];
          if(!link) return;
          if(entry.isIntersecting){
            // remove other active
            Object.keys(idToLink).forEach(function(k){
              var l = idToLink[k]; if(l) l.classList.remove('toc-active');
            });
            link.classList.add('toc-active');
            // ensure active link is visible inside TOC scroll container
            try{
              // find nearest scrollable ancestor (the .toc element)
              var scrollParent = link.closest('.toc');
              if(scrollParent && scrollParent !== document.body && scrollParent !== document.documentElement){
                // compute offset to center the link in the scroll container
                var parentRect = scrollParent.getBoundingClientRect();
                var linkRect = link.getBoundingClientRect();
                var offset = (linkRect.top - parentRect.top) - (parentRect.height/2) + (linkRect.height/2);
                scrollParent.scrollBy({ top: offset, behavior: 'smooth' });
              } else {
                // Do not scroll the main document to avoid jumping behavior
              }
            }catch(e){}
          }
        });
      }, options);

      headings.forEach(function(h){ if(h.id) observer.observe(h); });
    }
  }catch(e){ console && console.error && console.error('toc.js error', e); }
});