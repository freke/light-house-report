export const styles = String.raw`:root {
  --bg-deep: hsl(220, 15%, 8%);
  --bg-surface: hsl(220, 15%, 12%);
  --bg-card: hsla(220, 15%, 16%, 0.6);
  --border: hsla(220, 15%, 25%, 0.4);
  --text-main: hsl(220, 10%, 95%);
  --text-dim: hsl(220, 10%, 70%);
  --accent: hsl(210, 100%, 55%);
  --accent-glow: hsla(210, 100%, 55%, 0.3);
  --success: hsl(150, 60%, 45%);
  --warning: hsl(40, 90%, 50%);
  --danger: hsl(0, 80%, 55%);
  --sidebar-width: 280px;
  --glass: blur(12px) saturate(180%);
  --chart-bg: hsla(210, 100%, 55%, 0.1);
}

.light-mode {
  --bg-deep: hsl(220, 20%, 97%);
  --bg-surface: hsl(220, 20%, 92%);
  --bg-card: hsla(220, 20%, 100%, 0.8);
  --border: hsla(220, 15%, 80%, 0.5);
  --text-main: hsl(220, 20%, 15%);
  --text-dim: hsl(220, 15%, 45%);
  --accent: hsl(210, 100%, 45%);
  --accent-glow: hsla(210, 100%, 45%, 0.15);
  --chart-bg: hsla(210, 100%, 45%, 0.05);
}

* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg-deep);
  color: var(--text-main);
  overflow-x: hidden;
  display: flex;
  transition: background 0.3s ease, color 0.3s ease;
}

.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
  padding: 2.5rem 1.5rem;
  position: fixed;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.logo {
  font-family: 'Outfit', sans-serif;
  font-size: 1.6rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--accent);
  margin-bottom: 2.5rem;
  letter-spacing: -0.5px;
}

.nav-links {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.nav-item {
  padding: 0.8rem 1.2rem;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  color: var(--text-dim);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  font-size: 0.95rem;
}

.nav-item:hover {
  color: var(--text-main);
  background: hsla(220, 15%, 50%, 0.1);
  transform: translateX(4px);
}

.nav-item.active {
  color: white;
  background: var(--accent);
  box-shadow: 0 4px 15px var(--accent-glow);
}

.theme-toggle {
  margin-top: auto;
  padding: 1.5rem 0 0.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-dim);
  font-size: 0.9rem;
  font-weight: 600;
}

#themeBtn {
  background: var(--accent);
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 700;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px var(--accent-glow);
}

#themeBtn:hover {
  transform: scale(1.05);
  filter: brightness(1.1);
}

main {
  margin-left: var(--sidebar-width);
  padding: 4rem 5rem;
  width: 100%;
  max-width: 1400px;
}

header {
  margin-bottom: 5rem;
  border-bottom: 2px solid var(--accent);
  padding-bottom: 2.5rem;
}

.header-info h1 {
  font-family: 'Outfit', sans-serif;
  font-size: 3.5rem;
  font-weight: 800;
  margin-bottom: 0.75rem;
  letter-spacing: -1.5px;
}

.header-info p {
  color: var(--text-dim);
  font-size: 1.2rem;
  max-width: 700px;
  line-height: 1.6;
}

section {
  margin-bottom: 12rem;
  scroll-margin-top: 4rem;
}

.section-header {
  margin-bottom: 4rem;
}

.section-header h2 {
  font-family: 'Outfit', sans-serif;
  font-size: 2.5rem;
  margin-bottom: 1.25rem;
  color: var(--text-main);
  position: relative;
  display: inline-block;
}

.section-header h2::after {
  content: '';
  position: absolute;
  left: 0;
  bottom: -8px;
  width: 60px;
  height: 4px;
  background: var(--accent);
  border-radius: 2px;
}

.section-header p {
  color: var(--text-dim);
  font-size: 1.1rem;
  line-height: 1.5;
  max-width: 850px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 2rem;
  margin-bottom: 5rem;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 24px;
  padding: 2.5rem;
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.card:hover {
  transform: translateY(-8px);
  box-shadow: 0 30px 60px rgba(0,0,0,0.3);
  border-color: var(--accent);
}

.stat-card .label {
  color: var(--text-dim);
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 1rem;
  font-weight: 800;
}

.stat-card .value {
  font-size: 3.5rem;
  font-weight: 800;
  font-family: 'Outfit', sans-serif;
  color: var(--text-main);
  line-height: 1;
}

.stat-card .trend {
  margin-top: 1rem;
  font-size: 0.95rem;
  color: var(--accent);
  font-weight: 600;
}

.chart-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 28px;
  padding: 3rem;
  margin-bottom: 3.5rem;
}

.chart-header {
  margin-bottom: 3rem;
}

.chart-header h3 {
  font-family: 'Outfit', sans-serif;
  font-size: 1.8rem;
  margin-bottom: 0.75rem;
  color: var(--text-main);
}

.chart-header p {
  font-size: 1rem;
  color: var(--text-dim);
  max-width: 800px;
}

.chart-box {
  position: relative;
  height: 600px;
}

.table-container {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 28px;
  padding: 2rem;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
}

table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.95rem;
}

th {
  text-align: left;
  padding: 1.5rem 1rem;
  color: var(--text-dim);
  font-weight: 800;
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 1.5px;
  border-bottom: 2px solid var(--border);
}

td {
  padding: 1.5rem 1rem;
  border-bottom: 1px solid var(--border);
  font-weight: 500;
}

tr:last-child td { border-bottom: none; }

tr:hover td {
  background: hsla(210, 100%, 55%, 0.05);
}

.url-cell {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: 0.85rem;
  color: var(--accent);
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.url-cell a {
  color: inherit;
  text-decoration: none;
}

.url-cell a:hover {
  text-decoration: underline;
}

.explainer-box {
  background: var(--chart-bg);
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: 12px;
  padding: 1.25rem;
  margin-top: 1.5rem;
  font-size: 0.95rem;
  color: var(--text-dim);
  line-height: 1.6;
  max-width: 900px;
}

.explainer-box strong {
  color: var(--text-main);
  font-weight: 600;
}

.mode-cell {
  white-space: nowrap !important;
}

.badge {
  display: inline-block;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap !important;
}

.badge.mobile, .badge.mobile-4g { background: hsla(25, 95%, 55%, 0.15); color: hsl(25, 95%, 55%); border: 1px solid hsla(25, 95%, 55%, 0.3); }
.badge.mobile-wifi { background: hsla(45, 95%, 50%, 0.15); color: hsl(45, 95%, 50%); border: 1px solid hsla(45, 95%, 50%, 0.3); }
.badge.desktop { background: hsla(210, 100%, 50%, 0.15); color: hsl(210, 100%, 50%); border: 1px solid hsla(210, 100%, 50%, 0.3); }

.good { color: var(--success); font-weight: 800; }
.avg { color: var(--warning); font-weight: 800; }
.poor { color: var(--danger); font-weight: 800; }

::-webkit-scrollbar { width: 12px; }
::-webkit-scrollbar-track { background: var(--bg-deep); }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 6px; border: 3px solid var(--bg-deep); }
::-webkit-scrollbar-thumb:hover { background: var(--accent); }

@media print {
  html { font-size: 12px !important; }
  body { font-size: 12px !important; background: white !important; color: black !important; }
  .sidebar { display: none !important; }
  main { margin-left: 0 !important; padding: 0 !important; max-width: none !important; }
  .theme-toggle { display: none !important; }
  .chart-box { height: 260px !important; }
  .chart-box canvas { width: 100% !important; height: 100% !important; object-fit: contain !important; }
  .chart-container { padding: 1.5rem !important; margin-bottom: 2rem !important; }
  .card, .chart-container, tr { page-break-inside: avoid !important; break-inside: avoid !important; }
  .header-info h1 { font-size: 2.2rem !important; }
  .header-info p { font-size: 1rem !important; }
  .section-header h2 { font-size: 1.8rem !important; margin-bottom: 0.5rem !important; }
  .section-header p { font-size: 1rem !important; }
  .stat-card .value { font-size: 2.2rem !important; }
  .stat-card .label { font-size: 0.8rem !important; margin-bottom: 0.5rem !important; }
  section { margin-bottom: 3rem !important; }
  .section-header { page-break-after: avoid !important; page-break-inside: avoid !important; }
  header { margin-bottom: 3rem !important; padding-bottom: 1rem !important; }
  .card { padding: 1.5rem !important; }
  .stats-grid { gap: 1rem !important; margin-bottom: 2rem !important; }
  .chart-header { margin-bottom: 1rem !important; }
  .chart-header h3 { font-size: 1.4rem !important; margin-bottom: 0.2rem !important; }
  .chart-header p { font-size: 0.95rem !important; }
  td, th { padding: 0.8rem !important; font-size: 0.8rem !important; }
  .url-cell { font-size: 0.65rem !important; max-width: 220px !important; direction: rtl; text-align: left; word-break: break-all; }
  .badge { font-size: 0.55rem !important; padding: 4px 8px !important; letter-spacing: 0.5px !important; }
  .timeline-slider-container { display: none !important; }
}

@media (max-width: 1000px) {
  .sidebar { width: 90px; padding: 2.5rem 1rem; }
  .logo span, .nav-item span, .theme-toggle span { display: none; }
  main { margin-left: 90px; padding: 2rem; }
}

.modal {
  display: none;
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
}

.modal-content {
  background: var(--bg-surface);
  margin: 5% auto;
  padding: 2.5rem;
  border: 1px solid var(--border);
  border-radius: 24px;
  width: 90%;
  max-width: 700px;
  max-height: 80vh;
  position: relative;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
}

#modalBody {
  max-height: calc(80vh - 5rem);
  overflow-y: auto;
  overflow-x: hidden;
}

#modalBody::-webkit-scrollbar { width: 6px; }
#modalBody::-webkit-scrollbar-track { background: transparent; }
#modalBody::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
#modalBody::-webkit-scrollbar-thumb:hover { background: var(--accent); }

.close-modal {
  position: absolute;
  top: 1.5rem;
  right: 1.5rem;
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-dim);
  cursor: pointer;
  line-height: 1;
  transition: color 0.2s;
}

.close-modal:hover {
  color: var(--text-main);
}

.modal-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  font-family: 'Outfit', sans-serif;
  font-size: 1.8rem;
  margin-bottom: 0.5rem;
}

.modal-url {
  color: var(--accent);
  font-size: 0.9rem;
  word-break: break-all;
}

.modal-section {
  margin-bottom: 1.5rem;
}

.modal-section h3 {
  font-size: 1rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 1rem;
  font-weight: 700;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
}

.metric-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
}

.metric-label {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin-bottom: 0.5rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.metric-value {
  font-size: 1.5rem;
  font-weight: 800;
  font-family: 'Outfit', sans-serif;
}

.metric-value.good { color: var(--success); }
.metric-value.avg { color: var(--warning); }
.metric-value.poor { color: var(--danger); }

.modal-meta {
  display: flex;
  gap: 1.5rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  font-size: 0.85rem;
  color: var(--text-dim);
}

.timeline-slider-container {
  margin-bottom: 1rem;
  padding: 0 1rem;
  width: 80%;
  margin-right: auto;
  margin-left: auto;
}

.timeline-slider {
  margin: 10px 0;
}

/* Override default green to blue accent */
.noUi-connect {
  background: var(--accent) !important;
}

.noUi-target {
  background: var(--bg-surface) !important;
  border-color: var(--border) !important;
}

.noUi-handle {
  background: var(--bg-deep) !important;
  border-color: var(--border) !important;
}

.noUi-handle:focus {
  background: var(--text-dim) !important;
}

.noUi-handle:hover {
  background: var(--text-dim) !important;
}

.noUi-tooltip {
  background: var(--bg-card) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-main) !important;
}

.noUi-horizontal .noUi-tooltip {
  -webkit-transform: unset !important;
  transform: unset !important;
  left: unset !important;
}

/* Position left handle tooltip to the right */
.noUi-handle-lower .noUi-tooltip {
  right: 0 !important;
}

/* Position right handle tooltip to the left */
.noUi-handle-upper .noUi-tooltip {
}

.light-mode .noUi-handle {
  background: #ffffff !important;
  border-color: #cccccc !important;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
}

.light-mode .noUi-handle:hover {
  background: #f0f0f0 !important;
}

.light-mode .noUi-target {
  background: var(--bg-surface) !important;
  border-color: var(--border) !important;
}

.light-mode .noUi-tooltip {
  background: var(--bg-surface) !important;
  border: 1px solid var(--border) !important;
  color: var(--text-main) !important;
}

.timeline-current-labels {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  font-size: 0.8rem;
}

.current-label {
  color: var(--text-dim);
}`;
