(() => {
  'use strict';
  const base = new URL('/wzy-portfolio/', location.origin);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const form = document.getElementById('unlock-form');
  const field = document.getElementById('password');
  const status = document.getElementById('status');
  const button = form.querySelector('button');
  let contentKey = null;
  let files = null;
  const assets = new Map();
  const urls = new Set();
  let active = 0;
  const waiting = [];
  const unbase64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const objectUrl = id => {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid object');
    return new URL('objects/' + id + '.bin', base);
  };
  async function get(url, json = false) {
    const response = await fetch(url, {cache: json ? 'no-store' : 'force-cache', credentials: 'omit'});
    if (!response.ok) throw new Error('Network request failed');
    return json ? response.json() : response.arrayBuffer();
  }
  async function decrypt(data, key, context) {
    const bytes = new Uint8Array(data);
    if (decoder.decode(bytes.slice(0, 5)) !== 'WZYP1') throw new Error('Invalid content');
    return crypto.subtle.decrypt({name:'AES-GCM', iv:bytes.slice(5,17), additionalData:encoder.encode(context), tagLength:128}, key, bytes.slice(17));
  }
  async function fileBytes(path) {
    if (!contentKey || !files?.[path]) throw new Error('Locked');
    return decrypt(await get(objectUrl(files[path].id)), contentKey, 'portfolio-file-v1:' + path);
  }
  async function queued(task) {
    if (active >= 3) await new Promise(resolve => waiting.push(resolve));
    active++;
    try { return await task(); }
    finally { active--; waiting.shift()?.(); }
  }
  window.loadPortfolioMedia = path => {
    if (!contentKey || !files?.[path]) return Promise.reject(new Error('Locked'));
    if (!assets.has(path)) {
      const task = queued(async () => {
        const bytes = await fileBytes(path);
        const url = URL.createObjectURL(new Blob([bytes], {type:files[path].mime}));
        urls.add(url);
        return url;
      }).catch(error => {assets.delete(path); throw error;});
      assets.set(path, task);
    }
    return assets.get(path);
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.className = 'status';
    status.textContent = '正在打开…';
    let password = field.value;
    field.value = '';
    try {
      if (!crypto.subtle) throw new Error('Unsupported browser');
      const config = await get(new URL('manifest.json', base), true);
      if (config.version !== 1 || config.kdf.iterations < 600000) throw new Error('Invalid content');
      const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
      password = '';
      const wrappingKey = await crypto.subtle.deriveKey({name:'PBKDF2',salt:unbase64(config.kdf.salt),iterations:config.kdf.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);
      const bundle = JSON.parse(decoder.decode(await decrypt(await get(objectUrl(config.bundle)), wrappingKey, 'portfolio-manifest-v1')));
      contentKey = await crypto.subtle.importKey('raw', unbase64(bundle.key), 'AES-GCM', false, ['decrypt']);
      files = bundle.files;
      bundle.key = '';
      const html = decoder.decode(await fileBytes('index.html')).replace('__PORTFOLIO_PUBLIC_BASE__', base.href);
      const frame = document.createElement('iframe');
      frame.id = 'portfolio-frame';
      frame.title = '完整作品集';
      frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-downloads');
      frame.srcdoc = html;
      document.body.appendChild(frame);
      document.getElementById('gate').remove();
      document.getElementById('lock').hidden = false;
      document.title = '作品集';
    } catch (error) {
      password = '';
      contentKey = null;
      files = null;
      status.className = 'status error';
      status.textContent = error.name === 'OperationError' ? '密码不正确，请重试。' : error.message === 'Unsupported browser' ? '请使用新版浏览器打开此页面。' : '内容加载失败，请检查网络后重试。';
      field.focus();
    } finally {
      password = '';
      button.disabled = false;
    }
  });
  document.getElementById('lock').addEventListener('click', () => location.reload());
  window.addEventListener('pagehide', () => {for (const url of urls) URL.revokeObjectURL(url);});
})();
