export const UI_STYLES = String.raw`
:root {
  color-scheme: light dark;
  --bg: #07111f;
  --bg-soft: #0b1728;
  --panel: rgba(15, 29, 48, .86);
  --panel-solid: #101e31;
  --panel-hover: #162943;
  --line: rgba(148, 163, 184, .16);
  --line-strong: rgba(148, 163, 184, .28);
  --text: #edf5ff;
  --muted: #8fa4bd;
  --accent: #65e6c4;
  --accent-strong: #23c7a0;
  --accent-soft: rgba(101, 230, 196, .12);
  --blue: #7fb4ff;
  --blue-soft: rgba(127, 180, 255, .12);
  --warning: #ffc66d;
  --danger: #ff7f91;
  --success: #65e6c4;
  --shadow: 0 24px 80px rgba(0, 0, 0, .3);
  --radius: 20px;
  --radius-sm: 12px;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #edf3f8;
    --bg-soft: #f7fafc;
    --panel: rgba(255, 255, 255, .9);
    --panel-solid: #fff;
    --panel-hover: #f2f7fa;
    --line: rgba(30, 57, 83, .11);
    --line-strong: rgba(30, 57, 83, .2);
    --text: #102238;
    --muted: #5f7287;
    --accent: #0d9f7f;
    --accent-strong: #087c65;
    --accent-soft: rgba(13, 159, 127, .1);
    --blue: #367bd6;
    --blue-soft: rgba(54, 123, 214, .1);
    --warning: #a96600;
    --danger: #d13a54;
    --success: #0d9f7f;
    --shadow: 0 24px 70px rgba(29, 55, 82, .13);
  }
}

* { box-sizing: border-box; }
html { min-height: 100%; background: var(--bg); }
body { min-height: 100vh; margin: 0; color: var(--text); background:
  radial-gradient(circle at 12% 6%, rgba(52, 211, 153, .12), transparent 28rem),
  radial-gradient(circle at 92% 14%, rgba(59, 130, 246, .13), transparent 30rem),
  var(--bg); }
button, input, textarea, select { font: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }
a { color: inherit; }
.hidden { display: none !important; }
.muted { color: var(--muted); }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.login-shell { display: grid; place-items: center; min-height: 100vh; padding: 28px; }
.login-card { position: relative; width: min(100%, 430px); padding: 34px; border: 1px solid var(--line); border-radius: 28px; background: var(--panel); box-shadow: var(--shadow); backdrop-filter: blur(24px); }
.login-glow { position: absolute; inset: -1px; border-radius: inherit; pointer-events: none; background: linear-gradient(135deg, rgba(101,230,196,.25), transparent 32%, transparent 70%, rgba(127,180,255,.18)); mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude; padding: 1px; }
.brand { display: flex; align-items: center; gap: 12px; }
.brand-mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 14px; color: #05261f; background: linear-gradient(145deg, #9af1d8, #3dd7b2); box-shadow: 0 10px 30px rgba(42, 206, 165, .25); }
.brand-mark svg { width: 23px; height: 23px; }
.brand-copy strong { display: block; letter-spacing: -.02em; }
.brand-copy span { display: block; margin-top: 2px; color: var(--muted); font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
.login-card h1 { margin: 36px 0 8px; font-size: clamp(30px, 7vw, 42px); letter-spacing: -.055em; line-height: 1; }
.login-card > p { margin: 0 0 28px; color: var(--muted); line-height: 1.6; }
.field { display: grid; gap: 8px; }
.field + .field { margin-top: 16px; }
.field label, .field-label { color: var(--muted); font-size: 13px; font-weight: 650; }
.field input, .field textarea, .field select, .input { width: 100%; color: var(--text); background: color-mix(in srgb, var(--panel-solid) 82%, transparent); border: 1px solid var(--line-strong); border-radius: 12px; outline: 0; padding: 12px 13px; transition: border-color .18s, box-shadow .18s, transform .18s; }
.field textarea { min-height: 112px; resize: vertical; line-height: 1.5; }
.field input:focus, .field textarea:focus, .field select:focus, .input:focus { border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
.password-wrap { position: relative; }
.password-wrap input { padding-right: 48px; }
.icon-button { display: inline-grid; place-items: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--line); border-radius: 10px; color: var(--muted); background: transparent; cursor: pointer; }
.password-wrap .icon-button { position: absolute; top: 5px; right: 5px; }
.button { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; gap: 8px; min-height: 40px; padding: 9px 15px; border: 1px solid var(--line); border-radius: 11px; color: var(--text); background: var(--panel-solid); cursor: pointer; text-decoration: none; font-weight: 680; white-space: nowrap; transition: transform .16s, background .16s, border-color .16s, opacity .16s; }
.button svg { flex: 0 0 auto; width: 16px; height: 16px; }
.button:hover { transform: translateY(-1px); border-color: var(--line-strong); background: var(--panel-hover); }
.button:active { transform: translateY(0); }
.button:disabled { cursor: wait; opacity: .55; transform: none; }
.button-primary { color: #06261f; border-color: transparent; background: linear-gradient(145deg, #8debd1, #38d3ae); box-shadow: 0 12px 30px rgba(31, 190, 151, .18); }
.button-primary:hover { background: linear-gradient(145deg, #a5f2dd, #48dbb7); }
.button-danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 30%, transparent); background: color-mix(in srgb, var(--danger) 8%, transparent); }
.button-ghost { background: transparent; }
.button-full { width: 100%; margin-top: 20px; }
.login-meta { display: flex; gap: 10px; align-items: flex-start; margin-top: 22px; padding-top: 20px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; line-height: 1.5; }
.login-error { margin: 14px 0 0 !important; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--danger) 32%, transparent); border-radius: 10px; color: var(--danger) !important; background: color-mix(in srgb, var(--danger) 8%, transparent); font-size: 13px; }

.app-shell { display: grid; grid-template-columns: 252px minmax(0, 1fr); min-height: 100vh; }
.sidebar { position: sticky; top: 0; display: flex; flex-direction: column; height: 100vh; padding: 24px 18px; border-right: 1px solid var(--line); background: color-mix(in srgb, var(--bg-soft) 86%, transparent); backdrop-filter: blur(24px); z-index: 20; }
.sidebar .brand { padding: 0 8px; }
.side-nav { display: grid; gap: 6px; margin-top: 34px; }
.nav-button { display: flex; align-items: center; gap: 11px; width: 100%; padding: 11px 12px; border: 0; border-radius: 11px; color: var(--muted); background: transparent; cursor: pointer; text-align: left; font-weight: 620; }
.nav-button svg { width: 18px; height: 18px; }
.nav-button:hover { color: var(--text); background: var(--panel-hover); }
.nav-button.active { color: var(--accent); background: var(--accent-soft); }
.sidebar-footer { margin-top: auto; padding: 14px 10px 4px; }
.service-mini { padding: 13px; border: 1px solid var(--line); border-radius: 14px; background: var(--panel); }
.status-line { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 0 5px var(--accent-soft); }
.service-mini p { margin: 9px 0 0; color: var(--muted); font-size: 11px; }

.main { min-width: 0; padding: 26px clamp(20px, 4vw, 52px) 60px; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; max-width: 1440px; margin: 0 auto 32px; }
.topbar-copy p { margin: 0 0 5px; color: var(--muted); font-size: 13px; }
.topbar-copy h1 { margin: 0; font-size: clamp(25px, 3vw, 34px); letter-spacing: -.045em; }
.topbar-actions { display: flex; align-items: center; gap: 10px; }
.mobile-menu { display: none; }
.view { display: none; max-width: 1440px; margin: 0 auto; }
.view.active { display: block; animation: view-in .24s ease-out; }
@keyframes view-in { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
.section-head { display: flex; align-items: end; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
.section-head h2 { margin: 0; font-size: 22px; letter-spacing: -.035em; }
.section-head p { margin: 6px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
.section-actions { display: flex; flex-wrap: wrap; gap: 9px; }
.grid { display: grid; gap: 16px; }
.metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.two-col { grid-template-columns: minmax(0, 1.4fr) minmax(310px, .8fr); }
.equal-col { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.card { min-width: 0; padding: 20px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); box-shadow: 0 12px 38px rgba(0, 0, 0, .06); backdrop-filter: blur(18px); }
.metric-card { position: relative; overflow: hidden; }
.metric-card::after { content: ""; position: absolute; width: 110px; height: 110px; right: -46px; top: -48px; border-radius: 50%; background: var(--accent-soft); }
.metric-label { color: var(--muted); font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
.metric-value { margin-top: 14px; font-size: clamp(24px, 3vw, 34px); font-weight: 760; letter-spacing: -.05em; }
.metric-foot { margin-top: 8px; color: var(--muted); font-size: 12px; }
.card-title { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 17px; }
.card-title h3 { margin: 0; font-size: 16px; letter-spacing: -.02em; }
.card-title p { margin: 4px 0 0; color: var(--muted); font-size: 12px; }
.badge, .chip { display: inline-flex; align-items: center; gap: 6px; width: fit-content; padding: 5px 9px; border: 1px solid var(--line); border-radius: 999px; color: var(--muted); background: color-mix(in srgb, var(--panel-solid) 75%, transparent); font-size: 11px; font-weight: 720; }
.badge-success { color: var(--success); border-color: color-mix(in srgb, var(--success) 28%, transparent); background: var(--accent-soft); }
.badge-blue { color: var(--blue); background: var(--blue-soft); }
.protocol-list { display: flex; flex-wrap: wrap; gap: 9px; }
.protocol { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 140px; padding: 12px; border: 1px solid var(--line); border-radius: 13px; background: color-mix(in srgb, var(--panel-solid) 70%, transparent); }
.protocol strong { font-size: 13px; }
.protocol span { color: var(--muted); font-size: 11px; }
.detail-list { display: grid; gap: 1px; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.detail-row { display: grid; grid-template-columns: 130px minmax(0, 1fr) auto; align-items: center; gap: 14px; min-height: 48px; padding: 10px 13px; background: color-mix(in srgb, var(--panel-solid) 72%, transparent); }
.detail-row + .detail-row { border-top: 1px solid var(--line); }
.detail-row > span:first-child { color: var(--muted); font-size: 12px; }
.detail-row strong { min-width: 0; font-size: 13px; }
.quick-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.action-tile { display: flex; flex-direction: column; align-items: flex-start; min-height: 112px; padding: 15px; border: 1px solid var(--line); border-radius: 14px; color: var(--text); background: color-mix(in srgb, var(--panel-solid) 70%, transparent); cursor: pointer; text-align: left; }
.action-tile:hover { border-color: var(--line-strong); background: var(--panel-hover); }
.action-tile strong { margin-top: auto; font-size: 13px; }
.action-tile span { margin-top: 4px; color: var(--muted); font-size: 11px; line-height: 1.4; }

.endpoint-bar { display: grid; grid-template-columns: minmax(180px, 1fr) 110px minmax(160px, .7fr) auto; gap: 10px; padding: 14px; border: 1px solid var(--line); border-radius: 16px; background: var(--panel); margin-bottom: 16px; }
.endpoint-bar .field { gap: 5px; }
.node-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.node-card { min-width: 0; padding: 17px; border: 1px solid var(--line); border-radius: 16px; background: color-mix(in srgb, var(--panel-solid) 74%, transparent); }
.node-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.node-head > div:first-child { min-width: 0; }
.node-head h3 { margin: 0; font-size: 14px; }
.node-head p { margin: 5px 0 0; color: var(--muted); font-size: 11px; }
.node-actions { display: flex; gap: 7px; }
.link-box { display: flex; align-items: center; gap: 8px; margin-top: 13px; padding: 10px 11px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-soft); color: var(--muted); font-size: 11px; }
.link-box code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.export-grid { display: grid; gap: 10px; }
.export-row { display: grid; grid-template-columns: 82px minmax(0, 1fr) auto; align-items: center; gap: 10px; }
.export-row label { color: var(--muted); font-size: 12px; }
.export-url { min-width: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-soft); color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.form-grid .span-2 { grid-column: 1 / -1; }
.checks { display: flex; flex-wrap: wrap; gap: 10px; }
.check-card { position: relative; display: flex; align-items: center; gap: 9px; padding: 11px 13px; border: 1px solid var(--line); border-radius: 11px; cursor: pointer; }
.check-card input { accent-color: var(--accent-strong); }
.check-card:has(input:checked) { border-color: color-mix(in srgb, var(--accent) 45%, transparent); background: var(--accent-soft); }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.hint { color: var(--muted); font-size: 11px; line-height: 1.5; }
.warning { padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--warning) 28%, transparent); border-radius: 12px; color: var(--warning); background: color-mix(in srgb, var(--warning) 7%, transparent); font-size: 12px; line-height: 1.55; }

.ip-table, .log-list { display: grid; gap: 8px; }
.ip-row { display: grid; grid-template-columns: minmax(160px, 1.2fr) 86px minmax(120px, .8fr) 90px auto; align-items: center; gap: 10px; padding: 12px 13px; border: 1px solid var(--line); border-radius: 13px; background: color-mix(in srgb, var(--panel-solid) 70%, transparent); }
.ip-row.selected { border-color: color-mix(in srgb, var(--accent) 42%, transparent); background: var(--accent-soft); }
.ip-address { min-width: 0; }
.ip-address strong { display: block; font-size: 13px; }
.ip-address span { display: block; margin-top: 4px; color: var(--muted); font-size: 11px; }
.ip-actions { display: flex; justify-content: flex-end; gap: 6px; }
.empty-state { padding: 42px 20px; border: 1px dashed var(--line-strong); border-radius: 16px; color: var(--muted); text-align: center; }
.empty-state strong { display: block; color: var(--text); margin-bottom: 7px; }

.log-toolbar { display: grid; grid-template-columns: minmax(180px, 1fr) 160px auto; gap: 10px; margin-bottom: 14px; }
.log-item { display: grid; grid-template-columns: 95px minmax(110px, .55fr) minmax(180px, 1.3fr) minmax(140px, .8fr); gap: 12px; align-items: center; padding: 12px 13px; border: 1px solid var(--line); border-radius: 12px; background: color-mix(in srgb, var(--panel-solid) 70%, transparent); font-size: 11px; }
.log-item time, .log-item .ua { color: var(--muted); }
.log-item code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.integration-card { display: grid; gap: 14px; }
.integration-status { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.security-actions { display: grid; gap: 12px; }
.danger-zone { border-color: color-mix(in srgb, var(--danger) 26%, transparent); }

.toast-stack { position: fixed; top: 18px; right: 18px; display: grid; gap: 10px; width: min(360px, calc(100vw - 36px)); z-index: 80; }
.toast { padding: 13px 15px; border: 1px solid var(--line-strong); border-radius: 13px; background: var(--panel-solid); box-shadow: var(--shadow); font-size: 13px; animation: toast-in .2s ease-out; }
.toast.success { border-color: color-mix(in srgb, var(--success) 40%, transparent); }
.toast.error { border-color: color-mix(in srgb, var(--danger) 40%, transparent); color: var(--danger); }
@keyframes toast-in { from { opacity: 0; transform: translateY(-8px); } }

dialog { width: min(92vw, 430px); padding: 0; border: 1px solid var(--line); border-radius: 20px; color: var(--text); background: var(--panel-solid); box-shadow: var(--shadow); }
dialog::backdrop { background: rgba(2, 8, 18, .72); backdrop-filter: blur(5px); }
.dialog-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--line); }
.dialog-head h3 { margin: 0; }
.dialog-body { padding: 20px; }
.qr-stage { display: grid; place-items: center; width: min(100%, 310px); aspect-ratio: 1; margin: 0 auto; padding: 14px; border-radius: 16px; background: #fff; }
.qr-stage svg { width: 100%; height: 100%; }
.qr-caption { margin-top: 14px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; text-align: center; }
.loading-overlay { position: fixed; inset: 0; display: grid; place-items: center; z-index: 100; background: var(--bg); }
.loader { width: 42px; height: 42px; border: 3px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 1080px) {
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .two-col, .equal-col, .node-grid { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 780px) {
  .app-shell { grid-template-columns: 1fr; }
  .sidebar { position: fixed; left: 0; width: min(82vw, 280px); transform: translateX(-105%); transition: transform .22s ease; box-shadow: var(--shadow); }
  body.menu-open .sidebar { transform: translateX(0); }
  body.menu-open::after { content: ""; position: fixed; inset: 0; z-index: 10; background: rgba(2, 8, 18, .55); }
  .main { padding: 18px 16px 44px; }
  .mobile-menu { display: inline-grid; }
  .topbar { margin-bottom: 24px; }
  .topbar-copy p { display: none; }
  .topbar-actions .button span { display: none; }
  .endpoint-bar { grid-template-columns: 1fr 90px; }
  .endpoint-bar .field:nth-child(3) { grid-column: 1 / -1; }
  .endpoint-bar .button { grid-column: 1 / -1; }
  .ip-row { grid-template-columns: minmax(0, 1fr) auto; }
  .ip-row > :nth-child(2), .ip-row > :nth-child(3), .ip-row > :nth-child(4) { display: none; }
  .log-item { grid-template-columns: 84px minmax(0, 1fr); }
  .log-item > :nth-child(3), .log-item > :nth-child(4) { grid-column: 1 / -1; }
}

@media (max-width: 540px) {
  .login-card { padding: 26px 22px; border-radius: 22px; }
  .metrics, .form-grid { grid-template-columns: 1fr; }
  .form-grid .span-2 { grid-column: auto; }
  .section-head { align-items: flex-start; flex-direction: column; }
  .card { padding: 16px; border-radius: 17px; }
  .detail-row { grid-template-columns: 96px minmax(0, 1fr); }
  .detail-row > :last-child:not(:nth-child(2)) { grid-column: 2; }
  .quick-actions { grid-template-columns: 1fr; }
  .export-row { grid-template-columns: 1fr auto; }
  .export-row label { grid-column: 1 / -1; }
  .log-toolbar { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; transition-duration: .01ms !important; }
}
`;
