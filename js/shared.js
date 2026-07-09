// ============================================================
// SHARED.JS — Sidebar HTML reutilizable entre páginas
// ============================================================

function buildSidebar(activePage) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const navItems = [
    { page: 'dashboard',         href: 'dashboard.html',          icon: '📊', label: 'Dashboard' },
    { page: 'solicitudes',       href: 'solicitudes.html',        icon: '📋', label: 'Solicitudes', badge: true },
    { page: 'vigentes',          href: 'proyectos-vigentes.html', icon: '🟢', label: 'Proyectos Vigentes' },
    { page: 'calendario',        href: 'calendario.html',         icon: '📅', label: 'Calendario' },
    { page: 'cierres',           href: 'cierres.html',            icon: '📄', label: 'Cierres / Reportes', adminOnly: true },
    { page: 'financiero',        href: 'financiero.html',         icon: '💰', label: 'Financiero', adminOnly: true },
    { page: 'gastos',            href: 'gastos-generales.html',   icon: '💸', label: 'Gastos Generales' },
    { page: 'reportes',          href: 'reportes.html',           icon: '📈', label: 'Reportes' },
    { page: 'admin',             href: 'admin.html',              icon: '⚙️', label: 'Administración', adminOnly: true },
  ];

  const user = typeof Auth !== 'undefined' ? Auth.getCurrentUser() : null;
  const isAdmin = user?.rol === 'admin';

  const navHtml = navItems
    .filter(item => !item.adminOnly || isAdmin)
    .map(item => `
      <a class="nav-item ${activePage === item.page ? 'active' : ''}" data-page="${item.page}" href="${item.href}">
        <span class="nav-item-icon">${item.icon}</span>
        ${item.label}
        ${item.badge ? `<span class="nav-item-badge" id="nav-badge-sol" style="display:none">0</span>` : ''}
      </a>
    `).join('');

  const areas = typeof getAreas === 'function' ? getAreas().filter(a => a.activo) : [];
  const areasHtml = areas.map(a => `
    <a class="nav-item" href="solicitudes.html?area=${a.id}" style="padding-left:var(--space-5)">
      <span class="nav-item-icon" style="font-size:.85rem">${a.emoji}</span>
      <span style="font-size:var(--text-xs)">${a.nombre}</span>
    </a>
  `).join('');

  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">🏆</div>
      <div>
        <div class="sidebar-logo-text">Gestión</div>
        <div class="sidebar-logo-sub">Servicios Deportivos</div>
      </div>
    </div>
    <nav class="sidebar-nav">
      <div class="nav-section-label">Principal</div>
      ${navHtml}
      <div class="nav-section-label">Áreas</div>
      ${areasHtml}
    </nav>
    <div class="sidebar-user" id="sidebar-user-btn">
      <div class="avatar" id="sidebar-avatar">U</div>
      <div class="sidebar-user-info">
        <div class="sidebar-user-name" id="sidebar-user-name">...</div>
        <div class="sidebar-user-role" id="sidebar-user-role"></div>
      </div>
      <span style="color:var(--text-muted)" data-tooltip="Cerrar sesión">↩</span>
    </div>
  `;

  document.getElementById('sidebar-user-btn')?.addEventListener('click', () => {
    if (typeof Auth !== 'undefined') Auth.logout();
  });

  // Update nav badge
  updateNavBadge();
}

function updateNavBadge() {
  const badge = document.getElementById('nav-badge-sol');
  if (!badge) return;
  const activas = (Store.get('solicitudes') || []).filter(s => !['completado','cancelado'].includes(s.estado));
  badge.textContent = activas.length;
  badge.style.display = activas.length > 0 ? 'flex' : 'none';
}

// Topbar compartido con notificaciones
function buildTopbar({ title, subtitle, actions = '' }) {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;
  topbar.innerHTML = `
    <div class="topbar-left">
      <button class="sidebar-toggle" id="sidebar-toggle">☰</button>
      <div class="min-w-0">
        <div class="page-title">${title}</div>
        ${subtitle ? `<div class="page-subtitle">${subtitle}</div>` : ''}
      </div>
    </div>
    <div class="topbar-right">
      ${actions}
      <div class="notif-bell" id="notif-bell">🔔
        <span class="badge-count" id="notif-badge" style="display:none">0</span>
      </div>
    </div>
    <div class="notif-panel hidden" id="notif-panel">
      <div class="notif-panel-header">
        <span class="notif-panel-title">🔔 Notificaciones</span>
        <button class="btn btn-ghost btn-sm" onclick="markAllNotifsRead()">Marcar leídas</button>
      </div>
      <div class="notif-panel-body" id="notif-panel-body"></div>
    </div>
  `;
  initSidebarToggle();
  initNotifPanel();
  updateNotifBadge();
}

// Init completo de página interior
function initPage(activePage, { title, subtitle, actions = '' } = {}) {
  if (!Auth.requireAuth()) return false;
  const user = Auth.getCurrentUser();
  buildSidebar(activePage);
  buildTopbar({ title, subtitle, actions });
  renderSidebarUser(user);
  setTimeout(hideLoader, 300);
  return true;
}
