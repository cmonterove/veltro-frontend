// Shell: Topbar + Sidebar

function Topbar({ orgName, onToggleSidebar, theme, onToggleTheme, onOpenCmdK, activeCompany }) {
  return (
    <div className="topbar">
      <div className="topbar__brand">
        <button className="topbar__icon-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <I.PanelLeft size={16} />
        </button>
        <VeltroMark size={22} color="var(--primary)" />
        <span className="topbar__brand-name">Veltro</span>
        <span className="topbar__org">{orgName}</span>
      </div>

      <div className="topbar__search" onClick={onOpenCmdK}>
        <I.Search size={14} />
        <input placeholder="Buscar en Veltro…" readOnly />
        <kbd>⌘K</kbd>
      </div>

      <div className="topbar__right">
        <button className="topbar__icon-btn tt" data-label="Novedades">
          <I.Sparkles size={16} />
        </button>
        <button className="topbar__icon-btn tt" data-label="Notificaciones">
          <I.Bell size={16} />
          <span className="topbar__badge" />
        </button>
        <button className="topbar__icon-btn tt" data-label="Idioma: Español" style={{ fontSize: 14 }}>
          🇦🇷
        </button>
        <button className="topbar__icon-btn tt" data-label={`Tema: ${theme}`} onClick={onToggleTheme}>
          {theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />}
        </button>
        <div className="topbar__avatar" title="César Morales">CM</div>
      </div>
    </div>
  );
}

function Sidebar({ activePage, onNavigate, activeBoardId, collapsed }) {
  const [openCos, setOpenCos] = useState({ tech: true, design: false, ops: false });
  const toggleCo = (id) => setOpenCos(p => ({ ...p, [id]: !p[id] }));

  if (collapsed) {
    return (
      <aside className="sidebar" style={{ alignItems: 'center', padding: '10px 0' }}>
        <div className="vstack" style={{ gap: 2, width: '100%', padding: '0 8px' }}>
          {[
            { id: 'home',   icon: <I.Home size={16} />, label: 'Inicio' },
            { id: 'mywork', icon: <I.CheckSquare size={16} />, label: 'Mi trabajo' },
            { id: 'inbox',  icon: <I.Inbox size={16} />, label: 'Inbox' },
          ].map(l => (
            <button key={l.id}
              className={cx('sidebar__link', activePage === l.id && 'sidebar__link--active')}
              onClick={() => onNavigate(l.id)}
              style={{ justifyContent: 'center', padding: '8px 0' }}
              title={l.label}>
              {l.icon}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sidebar__section">
        <button className={cx('sidebar__link', activePage === 'home' && 'sidebar__link--active')}
          onClick={() => onNavigate('home')}>
          <I.Home size={16} /> Inicio
        </button>
        <button className={cx('sidebar__link', activePage === 'mywork' && 'sidebar__link--active')}
          onClick={() => onNavigate('mywork')}>
          <I.CheckSquare size={16} /> Mi trabajo
          <span className="count">5</span>
        </button>
        <button className="sidebar__link">
          <I.Inbox size={16} /> Bandeja de entrada
          <span className="count">12</span>
        </button>
      </div>

      <div className="sidebar__section" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="sidebar__heading">
          <span>Empresas</span>
          <button className="topbar__icon-btn" style={{ width: 22, height: 22 }} title="Nueva empresa">
            <I.Plus size={13} />
          </button>
        </div>
        {COMPANIES.map(co => (
          <div key={co.id}>
            <div className="sidebar__company-row" data-open={openCos[co.id]} onClick={() => toggleCo(co.id)}>
              <I.ChevronRight size={12} className="sidebar__chev" />
              <span className="board-dot" style={{ background: co.color }} />
              <span className="truncate">{co.name}</span>
              <span className="spacer" />
              <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{co.boards.length}</span>
            </div>
            {openCos[co.id] && (
              <div className="sidebar__boards">
                {co.boards.map(b => (
                  <button key={b.id}
                    className={cx('sidebar__board-link', activeBoardId === b.id && 'sidebar__board-link--active')}
                    onClick={() => onNavigate('board', { boardId: b.id, companyId: co.id })}>
                    <span className="board-dot" style={{ background: b.color }} />
                    <span className="truncate">{b.name}</span>
                  </button>
                ))}
                <button className="sidebar__board-link" style={{ color: 'var(--fg-subtle)' }}>
                  <I.Plus size={12} /> Nuevo board
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="sidebar__footer">
        <button className="sidebar__link" onClick={() => onNavigate('settings')}>
          <I.Settings size={16} /> Configuración
        </button>
        <button className="topbar__icon-btn tt" data-label="Ayuda">
          <I.AlertCircle size={15} />
        </button>
      </div>
    </aside>
  );
}

Object.assign(window, { Topbar, Sidebar });
