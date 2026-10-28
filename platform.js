(() => {
  'use strict';
  const status = document.getElementById('platform-status');
  const retry = document.getElementById('platform-retry');
  const toggle = document.getElementById('platform-help-toggle');
  const help = document.getElementById('platform-help');
  toggle.addEventListener('click', () => {
    help.hidden = !help.hidden;
    toggle.setAttribute('aria-expanded', String(!help.hidden));
  });
  if (location.protocol === 'file:') {
    status.textContent = '本地文件模式 · Mac可直接刷题；iPhone需HTTPS';
    return;
  }
  document.getElementById('app-manifest').href = 'manifest.webmanifest';
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    status.textContent = '离线安装不可用 · 请使用 HTTPS（开发可用 localhost）及支持的浏览器';
    return;
  }

  let registration;
  let ready = false;
  let failure = '';
  let updateFailure = false;
  let sequence = 0;
  let busy = false;
  const watched = new WeakSet();
  const render = () => {
    let text = ready ? '离线就绪 · 本机静态资源已验证' : (failure || '安装缓存中 · 请保持联网');
    if (!navigator.onLine) text += ready ? ' · 当前离线' : ' · 当前离线，联网后可重试';
    if (registration && registration.waiting) {
      text += ' · 新版本待更新：完成答题后关闭所有窗口再重开';
    } else if (updateFailure && ready) {
      text += ' · 新版本检查失败，当前离线版本仍可用';
    }
    status.textContent = text;
    retry.hidden = !failure && !updateFailure;
  };
  const query = worker => new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(new Error('离线检查超时'));
    }, 8000);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(event.data);
    };
    try {
      worker.postMessage({ type: 'CHECK_OFFLINE' }, [channel.port2]);
    } catch (error) {
      clearTimeout(timer);
      channel.port1.close();
      reject(error);
    }
  });
  const verify = async () => {
    const current = ++sequence;
    const controller = navigator.serviceWorker.controller;
    const expected = new URL('sw.js', location.href).href;
    if (!controller || controller.state !== 'activated' || controller.scriptURL !== expected) {
      ready = false;
      render();
      return;
    }
    try {
      const result = await query(controller);
      if (current !== sequence) return;
      ready = result.type === 'OFFLINE_STATUS' && result.ready === true;
      failure = ready ? '' : '离线缓存不完整 · 请保存记录，关闭所有窗口后联网重开；可重试检查';
    } catch (_) {
      if (current !== sequence) return;
      ready = false;
      failure = '离线验证失败 · 可联网后重试；不要在答题中刷新';
    }
    render();
  };
  const watch = worker => {
    if (!worker || watched.has(worker)) return;
    watched.add(worker);
    worker.addEventListener('statechange', () => {
      if (worker.state === 'redundant') {
        updateFailure = true;
        if (!ready) failure = '离线安装失败 · 检查网络和完整资源部署后重试';
      }
      if (worker.state === 'activated') verify();
      // waiting is populated after the installed state transition.
      setTimeout(render, 0);
    });
  };
  const start = async () => {
    if (busy) return;
    busy = true;
    failure = '';
    updateFailure = false;
    render();
    try {
      registration = await navigator.serviceWorker.register('./sw.js', {
        scope: './', updateViaCache: 'none'
      });
      watch(registration.installing);
      registration.addEventListener('updatefound', () => {
        watch(registration.installing);
        render();
      });
      await verify();
      // Retry checks/downloads without activating a waiting worker or reloading.
      await registration.update();
      watch(registration.installing);
      render();
    } catch (_) {
      updateFailure = true;
      if (!ready) failure = '离线安装／检查失败 · 请检查网络、浏览器权限及资源是否齐全后重试';
      render();
    } finally {
      busy = false;
    }
  };
  retry.addEventListener('click', start);
  navigator.serviceWorker.addEventListener('controllerchange', verify);
  window.addEventListener('online', () => {
    verify();
    if (!ready) start();
  });
  window.addEventListener('offline', verify);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) verify();
  });
  start();
})();
