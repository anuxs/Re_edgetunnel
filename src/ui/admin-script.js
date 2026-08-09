export const ADMIN_SCRIPT = String.raw`
(() => {
  'use strict';

  const state = { data: null, preview: null, selectedId: null, settingsSnapshot: null };
  const one = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const setText = (selector, value) => { const element = one(selector); if (element) element.textContent = value == null ? '–' : String(value); };

  async function api(path, options = {}) {
    const init = { credentials: 'same-origin', ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } };
    if (options.body && typeof options.body !== 'string') {
      init.body = JSON.stringify(options.body);
      init.headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(path, init);
    if (response.status === 401 || (response.status === 302 && response.headers.get('location') === '/login')) {
      location.replace('/login');
      throw new Error('会话已失效');
    }
    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('json') ? await response.json() : await response.text();
    if (!response.ok) throw new Error((result && result.error) || (typeof result === 'string' ? result : '请求失败'));
    return result;
  }

  function toast(message, type = 'success') {
    const item = document.createElement('div');
    item.className = 'toast ' + type;
    item.textContent = message;
    one('[data-toasts]').append(item);
    setTimeout(() => item.remove(), 3600);
  }

  async function copyText(value, success = '已复制到剪贴板') {
    try {
      await navigator.clipboard.writeText(String(value));
    } catch {
      const area = document.createElement('textarea');
      area.value = String(value);
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    toast(success);
  }

  function showView(name) {
    all('[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === name));
    all('[data-view-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.viewPanel === name));
    const active = one('[data-view="' + name + '"]');
    setText('[data-page-title]', active?.dataset.viewLabel || 'EdgeTunnel');
    document.body.classList.remove('menu-open');
    history.replaceState(null, '', '#' + name);
  }

  function formatTime(value) {
    const date = new Date(Number(value) || value);
    if (Number.isNaN(date.getTime())) return '未知';
    return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
  }

  function renderOverview() {
    const data = state.data;
    setText('[data-mini-host]', data.service.host);
    setText('[data-service-host]', data.service.host);
    setText('[data-service-path]', data.service.tunnelPath);
    setText('[data-service-uuid]', data.service.maskedUuid);
    setText('[data-client-location]', [data.request.country, data.request.city].filter(Boolean).join(' / ') || 'Unknown');
    setText('[data-colo]', data.request.colo ? 'CF ' + data.request.colo : 'CF EDGE');
    setText('[data-metric-nodes]', data.stats.nodeCount);
    setText('[data-metric-transports]', data.service.transports.length);
    setText('[data-metric-requests]', data.stats.subscriptionRequests);
    setText('[data-metric-ips]', data.preferredIps.length);
    const list = one('[data-protocol-list]');
    list.replaceChildren();
    data.service.protocolMatrix.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'protocol';
      const copy = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = item.name;
      const detail = document.createElement('span');
      detail.textContent = item.transport;
      copy.append(strong, detail);
      const badge = document.createElement('span');
      badge.className = 'badge badge-success';
      badge.textContent = '已配置';
      row.append(copy, badge);
      list.append(row);
    });
    one('[data-copy-default-sub]').onclick = () => copyText(data.exports.clash, '默认 Clash URL 已复制');
  }

  function renderSettings() {
    const settings = state.data.settings;
    state.settingsSnapshot = structuredClone(settings);
    const form = one('[data-settings-form]');
    form.elements.subscriptionName.value = settings.subscriptionName;
    form.elements.tunnelPath.value = settings.tunnelPath;
    form.elements.fingerprint.value = settings.fingerprint;
    form.elements.updateInterval.value = settings.updateInterval;
    all('input[name="transport"]', form).forEach((input) => { input.checked = settings.transports.includes(input.value); });
    form.elements.shadowsocks.checked = settings.shadowsocks;
    form.elements.zeroRtt.checked = settings.zeroRtt;
    form.elements.skipCertificateVerification.checked = settings.skipCertificateVerification;
    form.elements.tunnelPath.disabled = settings.pathLocked;
    setText('[data-settings-source]', settings.pathLocked ? 'PATH 环境变量优先' : 'KV 配置');
  }

  function renderPreferred() {
    const entries = state.data.preferredIps;
    setText('[data-ip-count]', entries.length + ' 项');
    setText('[data-metric-ips]', entries.length);
    const table = one('[data-ip-table]');
    table.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const title = document.createElement('strong');
      title.textContent = '尚未保存优选 IP';
      const message = document.createElement('span');
      message.textContent = '把本地扫描器的结果粘贴到右侧即可。';
      empty.append(title, message);
      table.append(empty);
      return;
    }
    entries.forEach((entry) => {
      const row = document.createElement('div');
      row.className = 'ip-row' + (entry.id === state.selectedId ? ' selected' : '');
      const address = document.createElement('div');
      address.className = 'ip-address';
      const strong = document.createElement('strong');
      strong.className = 'mono truncate';
      strong.textContent = entry.address;
      const label = document.createElement('span');
      label.textContent = entry.label || '未命名';
      address.append(strong, label);
      const port = document.createElement('span');
      port.className = 'mono muted';
      port.textContent = ':' + entry.port;
      const latency = document.createElement('span');
      latency.textContent = entry.latency == null ? '未记录延迟' : entry.latency + ' ms';
      latency.className = 'muted';
      const source = document.createElement('span');
      source.textContent = entry.source || '本地导入';
      source.className = 'muted';
      const actions = document.createElement('div');
      actions.className = 'ip-actions';
      const use = document.createElement('button');
      use.type = 'button';
      use.className = 'button button-ghost';
      use.textContent = entry.id === state.selectedId ? '已选择' : '选择';
      use.onclick = () => { state.selectedId = entry.id; renderPreferred(); };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', '删除地址');
      remove.onclick = () => removePreferred(entry.id);
      actions.append(use, remove);
      row.append(address, port, latency, source, actions);
      table.append(row);
    });
  }

  function renderLogs() {
    const search = (one('[data-log-search]')?.value || '').toLowerCase();
    const type = one('[data-log-type]')?.value || '';
    const logs = state.data.logs.filter((log) => {
      if (type && log.type !== type) return false;
      if (!search) return true;
      return [log.ip, log.url, log.ua, log.country, log.asn].join(' ').toLowerCase().includes(search);
    });
    const list = one('[data-log-list]');
    list.replaceChildren();
    if (!logs.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = '没有符合条件的日志。';
      list.append(empty);
      return;
    }
    logs.forEach((log) => {
      const row = document.createElement('div');
      row.className = 'log-item';
      const time = document.createElement('time');
      time.textContent = formatTime(log.time);
      const identity = document.createElement('code');
      identity.textContent = log.ip + ' · ' + log.type;
      const url = document.createElement('code');
      url.textContent = log.url;
      const ua = document.createElement('span');
      ua.className = 'ua truncate';
      ua.textContent = log.ua;
      row.append(time, identity, url, ua);
      list.append(row);
    });
  }

  function renderIntegrations() {
    const data = state.data.integrations;
    setText('[data-cf-status]', data.cloudflare.configured ? (data.cloudflare.usage.success ? data.cloudflare.usage.total + ' / ' + data.cloudflare.usage.max : '已配置') : '未配置');
    setText('[data-tg-status]', data.telegram.configured ? (data.telegram.enabled ? '已启用' : '已配置') : '未配置');
    one('[data-cf-form]').elements.mode.value = data.cloudflare.mode || 'none';
    one('[data-tg-form]').elements.enabled.checked = Boolean(data.telegram.enabled);
  }

  function renderNodes() {
    const preview = state.preview;
    if (!preview) return;
    setText('[data-clash-url]', preview.urls.clash);
    setText('[data-links-url]', preview.urls.links);
    one('[data-download-clash]').href = preview.urls.clash + '&download=1';
    one('[data-download-links]').href = preview.urls.links + '&download=1';
    setText('[data-preview-summary]', preview.nodes.length + ' 个节点 · server=' + preview.server.address + ':' + preview.server.port + ' · SNI=' + preview.serviceHost);
    const grid = one('[data-node-grid]');
    grid.replaceChildren();
    preview.nodes.forEach((node) => {
      const card = document.createElement('article');
      card.className = 'node-card';
      const head = document.createElement('div');
      head.className = 'node-head';
      const meta = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = node.name;
      const detail = document.createElement('p');
      detail.textContent = node.type.toUpperCase() + (node.network ? ' · ' + node.network.toUpperCase() : ' · WS') + ' · ' + node.server + ':' + node.port;
      meta.append(title, detail);
      const actions = document.createElement('div');
      actions.className = 'node-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'icon-button';
      copy.textContent = '⧉';
      copy.setAttribute('aria-label', '复制节点');
      copy.onclick = () => copyText(node.shareLink, '节点链接已复制');
      const qr = document.createElement('button');
      qr.type = 'button';
      qr.className = 'icon-button';
      qr.textContent = 'QR';
      qr.setAttribute('aria-label', '显示二维码');
      qr.onclick = () => showQr(node.shareLink, node.name);
      actions.append(copy, qr);
      head.append(meta, actions);
      const link = document.createElement('div');
      link.className = 'link-box';
      const code = document.createElement('code');
      code.textContent = node.shareLink;
      link.append(code);
      card.append(head, link);
      grid.append(card);
    });
  }

  async function buildPreview(target = null) {
    const params = new URLSearchParams();
    if (target?.address) {
      params.set('ip', target.address);
      params.set('port', String(target.port || 443));
      if (target.label) params.set('name', target.label);
    }
    state.preview = await api('/admin/api/preview' + (params.size ? '?' + params.toString() : ''));
    renderNodes();
  }

  async function buildPreviewFromForm() {
    const address = one('[data-preview-ip]').value.trim();
    const target = address ? {
      address,
      port: Number(one('[data-preview-port]').value || 443),
      label: one('[data-preview-label]').value.trim() || address,
    } : null;
    await buildPreview(target);
    toast(target ? '已生成优选 IP 配置' : '已恢复域名直连配置');
  }

  async function showQr(value, caption) {
    const svg = await api('/admin/api/qr', { method: 'POST', body: { text: value } });
    const stage = one('[data-qr-stage]');
    stage.replaceChildren();
    const parsed = new DOMParser().parseFromString(svg.svg, 'image/svg+xml').documentElement;
    stage.append(document.importNode(parsed, true));
    setText('[data-qr-caption]', caption);
    one('[data-qr-dialog]').showModal();
  }

  async function removePreferred(id) {
    const entries = state.data.preferredIps.filter((entry) => entry.id !== id);
    const result = await api('/admin/api/preferred-ips', { method: 'POST', body: { entries } });
    state.data.preferredIps = result.entries;
    if (state.selectedId === id) state.selectedId = null;
    renderPreferred();
    toast('优选 IP 已删除');
  }

  async function loadData({ quiet = false } = {}) {
    if (!quiet) one('[data-loading]').classList.remove('hidden');
    try {
      state.data = await api('/admin/api/bootstrap');
      if (state.selectedId && !state.data.preferredIps.some((entry) => entry.id === state.selectedId)) state.selectedId = null;
      renderOverview();
      renderSettings();
      renderPreferred();
      renderLogs();
      renderIntegrations();
      await buildPreview();
    } finally {
      one('[data-loading]').classList.add('hidden');
    }
  }

  function installEvents() {
    all('[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
    all('[data-go]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.go)));
    one('[data-menu]').addEventListener('click', () => document.body.classList.toggle('menu-open'));
    one('[data-refresh]').addEventListener('click', async () => { await loadData({ quiet: true }); toast('控制台已刷新'); });
    one('[data-build-preview]').addEventListener('click', () => buildPreviewFromForm().catch((error) => toast(error.message, 'error')));
    one('[data-copy-field="host"]').addEventListener('click', () => copyText(state.data.service.host));
    one('[data-copy-field="path"]').addEventListener('click', () => copyText(state.data.service.tunnelPath));
    all('[data-copy-url]').forEach((button) => button.addEventListener('click', () => copyText(state.preview.urls[button.dataset.copyUrl])));
    one('[data-close-qr]').addEventListener('click', () => one('[data-qr-dialog]').close());
    one('[data-qr-dialog]').addEventListener('click', (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });

    one('[data-settings-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body = {
        subscriptionName: form.elements.subscriptionName.value,
        tunnelPath: form.elements.tunnelPath.value,
        fingerprint: form.elements.fingerprint.value,
        updateInterval: Number(form.elements.updateInterval.value),
        transports: all('input[name="transport"]', form).filter((input) => input.checked).map((input) => input.value),
        shadowsocks: form.elements.shadowsocks.checked,
        zeroRtt: form.elements.zeroRtt.checked,
        skipCertificateVerification: form.elements.skipCertificateVerification.checked,
      };
      await api('/admin/api/settings', { method: 'POST', body });
      await loadData({ quiet: true });
      toast('服务设置已保存，订阅 URL 与 Token 保持不变');
    });
    one('[data-reset-settings]').addEventListener('click', renderSettings);
    one('[data-export-backup]').addEventListener('click', async () => {
      const backup = await api('/admin/api/backup');
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 're-edgetunnel-backup.json';
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      toast('安全配置备份已导出');
    });
    one('[data-import-backup]').addEventListener('click', () => one('[data-backup-file]').click());
    one('[data-backup-file]').addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > 256 * 1024) return toast('备份文件过大', 'error');
      try {
        const backup = JSON.parse(await file.text());
        await api('/admin/api/restore', { method: 'POST', body: { backup } });
        await loadData({ quiet: true });
        toast('配置与优选 IP 已恢复');
      } catch (error) {
        toast(error.message || '备份恢复失败', 'error');
      } finally {
        event.target.value = '';
      }
    });
    one('[data-reset-defaults]').addEventListener('click', async () => {
      if (!confirm('确定恢复默认订阅生成配置吗？优选 IP 库、管理员密码和 UUID 不会被删除。')) return;
      await api('/admin/api/reset', { method: 'POST' });
      await loadData({ quiet: true });
      toast('订阅生成设置已恢复默认值');
    });

    one('[data-ip-import-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const importText = one('[data-ip-import]').value;
      const result = await api('/admin/api/preferred-ips', { method: 'POST', body: { importText, entries: state.data.preferredIps } });
      state.data.preferredIps = result.entries;
      one('[data-ip-import]').value = '';
      renderPreferred();
      toast('扫描结果已导入');
    });
    one('[data-clear-ip-import]').addEventListener('click', () => { one('[data-ip-import]').value = ''; });
    one('[data-use-selected]').addEventListener('click', async () => {
      const entry = state.data.preferredIps.find((item) => item.id === state.selectedId);
      if (!entry) return toast('请先选择一个优选 IP', 'error');
      one('[data-preview-ip]').value = entry.address;
      one('[data-preview-port]').value = entry.port;
      one('[data-preview-label]').value = entry.label;
      showView('nodes');
      await buildPreview(entry);
    });

    one('[data-log-search]').addEventListener('input', renderLogs);
    one('[data-log-type]').addEventListener('change', renderLogs);
    one('[data-refresh-logs]').addEventListener('click', () => loadData({ quiet: true }).then(() => toast('日志已刷新')));
    one('[data-clear-logs]').addEventListener('click', async () => {
      if (!confirm('确定清空全部访问日志吗？此操作不会影响订阅和节点。')) return;
      await api('/admin/api/logs/clear', { method: 'POST' });
      state.data.logs = [];
      renderLogs();
      renderOverview();
      toast('访问日志已清空');
    });

    one('[data-cf-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await api('/admin/api/integrations/cloudflare', { method: 'POST', body: {
        mode: form.elements.mode.value,
        identity: form.elements.identity.value,
        secret: form.elements.secret.value,
      } });
      form.elements.secret.value = '';
      await loadData({ quiet: true });
      toast('Cloudflare 集成设置已保存');
    });
    one('[data-tg-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await api('/admin/api/integrations/telegram', { method: 'POST', body: {
        enabled: form.elements.enabled.checked,
        botToken: form.elements.botToken.value,
        chatId: form.elements.chatId.value,
      } });
      form.elements.botToken.value = '';
      await loadData({ quiet: true });
      toast('Telegram 集成设置已保存');
    });
    one('[data-proxy-check-form]').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      setText('[data-proxy-check-status]', '测试中…');
      try {
        const result = await api('/admin/api/proxy-check', { method: 'POST', body: { type: form.elements.type.value, value: form.elements.value.value } });
        const output = one('[data-proxy-check-result]');
        output.textContent = JSON.stringify(result, null, 2);
        output.classList.remove('hidden');
        setText('[data-proxy-check-status]', result.success ? '连接成功' : '连接失败');
      } catch (error) {
        setText('[data-proxy-check-status]', '不可用');
        toast(error.message, 'error');
      }
    });
    one('[data-revoke-sessions]').addEventListener('click', async () => {
      if (!confirm('确定撤销所有管理会话吗？你需要重新登录。')) return;
      await api('/admin/api/sessions/revoke', { method: 'POST' });
      location.replace('/login');
    });
  }

  installEvents();
  const initialView = location.hash.slice(1);
  if (one('[data-view="' + initialView + '"]')) showView(initialView);
  loadData().catch((error) => {
    one('[data-loading]').classList.add('hidden');
    toast(error.message || '控制台加载失败', 'error');
  });
})();
`;
