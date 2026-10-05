(() => {
  'use strict';
  const pending = new WeakMap();
  async function load(element, attribute = 'src') {
    const name = 'data-private-' + attribute;
    const path = element.getAttribute(name);
    if (!path || element.getAttribute(attribute)?.startsWith('blob:')) return;
    if (pending.has(element) && attribute === 'src') return pending.get(element);
    const task = window.parent.loadPortfolioMedia(path).then(url => {
      element.setAttribute(attribute, url);
      element.dataset.privateState = 'ready';
      if (element instanceof HTMLVideoElement && attribute === 'src') element.load();
    }).catch(error => {
      element.dataset.privateState = 'error';
      element.title = '加载失败，点击重试';
      pending.delete(element);
      throw error;
    });
    if (attribute === 'src') pending.set(element, task);
    return task;
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target;
      observer.unobserve(element);
      if (element instanceof HTMLImageElement) load(element).catch(() => {});
      if (element.hasAttribute('data-private-poster')) load(element,'poster').catch(() => {});
    }
  }, {rootMargin:'350px'});
  function scan(root) {
    if (root.nodeType !== Node.ELEMENT_NODE && root !== document) return;
    const elements = [...root.querySelectorAll('img[data-private-src],video[data-private-src]')];
    if (root.matches?.('img[data-private-src],video[data-private-src]')) elements.push(root);
    for (const element of elements) {
      observer.observe(element);
      if (element instanceof HTMLVideoElement) element.preload = 'none';
    }
  }
  const nativePlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = async function() {
    if (this.hasAttribute('data-private-src')) await load(this);
    return nativePlay.call(this);
  };
  document.addEventListener('click', async event => {
    const image = event.target.closest?.('img[data-private-src]');
    if (image?.dataset.privateState === 'error') load(image).catch(() => {});
    const video = event.target.closest?.('video[data-private-src]') || event.target.closest?.('.card-media')?.querySelector('video[data-private-src]');
    if (!video || video.getAttribute('src')?.startsWith('blob:')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    video.dataset.privateState = 'loading';
    try { await video.play(); }
    catch { video.title = '点击重试播放'; }
  }, true);
  new MutationObserver(records => {for (const record of records) for (const node of record.addedNodes) scan(node);}).observe(document.body,{childList:true,subtree:true});
  scan(document);
  window.addEventListener('hashchange', () => {
    const url = new URL(window.parent.location.href);
    url.hash = location.hash;
    window.parent.history.replaceState(null, '', url.href);
  });
  if (window.parent.location.hash) location.hash = window.parent.location.hash;
  const style = document.createElement('style');
  style.textContent = 'img[data-private-src]:not([src]){min-height:80px;background:#f4f2ee}video[data-private-state="loading"]{opacity:.6}.card-media:has(video[data-private-state="loading"])::after{content:"正在加载演示…";position:absolute;inset:0;display:grid;place-items:center;color:#fff;background:#0005;font-size:14px;pointer-events:none}';
  document.head.appendChild(style);
})();
