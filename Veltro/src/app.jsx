// Tweaks panel
function Tweaks({ state, setState, onClose }) {
  const hues = [
    { id: 'forest', label: 'Verde bosque', primary: '#1a3a2e', mid: '#2d8a6a', light: '#e8f5f0', dark: '#0d1f18' },
    { id: 'ocean',  label: 'Océano',        primary: '#0c2a4d', mid: '#2563eb', light: '#e0ecfe', dark: '#061628' },
    { id: 'plum',   label: 'Ciruela',       primary: '#3b1a4a', mid: '#8b5cf6', light: '#f1ecfe', dark: '#1d0d25' },
    { id: 'clay',   label: 'Terracota',     primary: '#4a1e0d', mid: '#c2410c', light: '#fee7d6', dark: '#260f07' },
    { id: 'slate',  label: 'Pizarra',       primary: '#1e293b', mid: '#475569', light: '#e6ebf2', dark: '#0b1220' },
  ];

  const apply = (h) => {
    const r = document.documentElement;
    r.style.setProperty('--primary', h.primary);
    r.style.setProperty('--primary-mid', h.mid);
    r.style.setProperty('--primary-light', h.light);
    r.style.setProperty('--primary-dark', h.dark);
    setState(s => ({ ...s, hue: h.id }));
  };

  return (
    <div className="tweaks">
      <div className="tweaks__header">
        <span>Tweaks</span>
        <button className="topbar__icon-btn" style={{ width: 22, height: 22 }} onClick={onClose}>
          <I.X size={13} />
        </button>
      </div>
      <div className="tweaks__body">
        <div className="tweaks__row">
          <span className="tweaks__row-label">Tema</span>
          <div className="tweaks__seg">
            {['light', 'dark'].map(t => (
              <button key={t} data-active={state.theme === t}
                onClick={() => setState(s => ({ ...s, theme: t }))}>
                {t === 'light' ? 'Claro' : 'Oscuro'}
              </button>
            ))}
          </div>
        </div>

        <div className="tweaks__row">
          <span className="tweaks__row-label">Paleta de marca</span>
          <div className="tweaks__swatches">
            {hues.map(h => (
              <button key={h.id} data-active={state.hue === h.id}
                className="tweaks__swatch" title={h.label}
                onClick={() => apply(h)}
                style={{ background: `linear-gradient(135deg, ${h.primary}, ${h.mid})` }} />
            ))}
          </div>
        </div>

        <div className="tweaks__row">
          <span className="tweaks__row-label">Densidad de tabla</span>
          <div className="tweaks__seg">
            {[
              { id: 36, l: 'Densa' },
              { id: 44, l: 'Cómoda' },
              { id: 52, l: 'Amplia' },
            ].map(d => (
              <button key={d.id} data-active={state.rowH === d.id}
                onClick={() => {
                  document.documentElement.style.setProperty('--row-h', d.id + 'px');
                  setState(s => ({ ...s, rowH: d.id }));
                }}>
                {d.l}
              </button>
            ))}
          </div>
        </div>

        <div className="tweaks__row">
          <span className="tweaks__row-label">Sidebar</span>
          <div className="tweaks__seg">
            <button data-active={!state.sidebarCollapsed} onClick={() => setState(s => ({ ...s, sidebarCollapsed: false }))}>Expandido</button>
            <button data-active={state.sidebarCollapsed} onClick={() => setState(s => ({ ...s, sidebarCollapsed: true }))}>Colapsado</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ======= Main App =======
function App() {
  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "theme": "light",
    "hue": "forest",
    "rowH": 44,
    "sidebarCollapsed": false,
    "showTweaks": true
  }/*EDITMODE-END*/;

  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem('veltro-state');
      if (saved) return { ...TWEAK_DEFAULTS, ...JSON.parse(saved) };
    } catch {}
    return TWEAK_DEFAULTS;
  });

  const [view, setView] = useState(() => localStorage.getItem('veltro-view') || 'login');
  const [activeBoardId, setActiveBoardId] = useState('sprint-14');
  const [groups, setGroups] = useState(BOARD_GROUPS);
  const [openItem, setOpenItem] = useState(null);
  const [showTweaks, setShowTweaks] = useState(true);
  const [activeCompanyId, setActiveCompanyId] = useState('tech');
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [showInviteMember, setShowInviteMember] = useState(false);
  const [inviteValid, setInviteValid] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme);
    document.documentElement.style.setProperty('--row-h', state.rowH + 'px');
    localStorage.setItem('veltro-state', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    localStorage.setItem('veltro-view', view);
  }, [view]);

  const navigate = (v, opts) => {
    setView(v);
    if (opts?.boardId) setActiveBoardId(opts.boardId);
    if (opts?.companyId) setActiveCompanyId(opts.companyId);
    setOpenItem(null);
  };

  const updateItem = (id, patch) => {
    setGroups(gs => gs.map(g => ({ ...g, items: g.items.map(it => it.id === id ? { ...it, ...patch } : it) })));
    setOpenItem(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
  };

  const board = { id: 'sprint-14', name: 'Sprint 14 — Q2', color: '#2563eb' };

  if (view === 'invite') {
    return (
      <>
        <InvitePage
          valid={inviteValid}
          onAccept={() => setView('home')}
          onBack={() => setView('login')}
        />
        <button onClick={() => setInviteValid(v => !v)} style={{
          position: 'fixed', bottom: 16, left: 16, fontSize: 11,
          color: 'rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.3)',
          padding: '4px 10px', borderRadius: 4, zIndex: 50,
        }}>Toggle: {inviteValid ? 'válida' : 'inválida'}</button>
        <Toasts />
      </>
    );
  }

  if (view === 'login') {
    return (
      <>
        <Login onLogin={() => setView('home')} />
        <button onClick={() => setView('invite')} style={{
          position: 'fixed', bottom: 16, left: 16, fontSize: 11,
          color: 'var(--fg-subtle)', textDecoration: 'underline', zIndex: 50,
        }}>ver página de invitación</button>
        <Toasts />
        {/* tiny theme toggle floating (so dark mode visible on login too) */}
        <button
          className="topbar__icon-btn"
          onClick={() => setState(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}
          style={{
            position: 'fixed', top: 16, right: 16, width: 36, height: 36,
            border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)',
            zIndex: 50,
          }}>
          {state.theme === 'dark' ? <I.Sun size={16} /> : <I.Moon size={16} />}
        </button>
      </>
    );
  }

  return (
    <div className="app">
      <Topbar
        orgName="Linea Labs"
        onToggleSidebar={() => setState(s => ({ ...s, sidebarCollapsed: !s.sidebarCollapsed }))}
        theme={state.theme}
        onToggleTheme={() => setState(s => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))}
        onOpenCmdK={() => toast('⌘K — búsqueda global (demo)')}
      />
      <div className="body" data-collapsed={state.sidebarCollapsed}>
        <Sidebar
          activePage={view}
          activeBoardId={view === 'board' ? activeBoardId : null}
          onNavigate={navigate}
          collapsed={state.sidebarCollapsed}
        />
        <main className="page">
          {view === 'home' && (
            <Home
              onNavigate={navigate}
              onOpenItem={(it) => { setView('board'); setOpenItem(it); }}
              allGroups={groups}
            />
          )}
          {view === 'mywork' && (
            <MyWork allGroups={groups} onOpenItem={(it) => { setView('board'); setOpenItem(it); }} />
          )}
          {view === 'boards' && (
            <BoardList
              companyId={activeCompanyId}
              onOpenBoard={(bid, cid) => navigate('board', { boardId: bid, companyId: cid })}
              onNewBoard={() => setShowCreateBoard(true)}
            />
          )}
          {view === 'members' && (
            <SettingsMembers onInvite={() => setShowInviteMember(true)} />
          )}
          {view === 'board' && (
            <>
              <BoardHeader board={board} onOpenMembers={() => toast('Invitar miembro — demo')} />
              <Toolbar onAdd={() => toast('Usá el botón "Agregar" de cada grupo')} />
              <BoardTable groups={groups} setGroups={setGroups} onOpenItem={setOpenItem} />
            </>
          )}
          {view === 'settings' && (
            <div className="page" style={{ padding: 40, maxWidth: 900 }}>
              <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 6px' }}>Configuración</h1>
              <p style={{ color: 'var(--fg-muted)', fontSize: 14 }}>Seleccioná una sección.</p>
              <div className="vstack" style={{ gap: 8, marginTop: 20, maxWidth: 420 }}>
                <button className="btn btn--secondary" onClick={() => navigate('members')} style={{ justifyContent: 'flex-start' }}>
                  <I.Users size={14} /> Miembros <span className="spacer" /><I.ChevronRight size={13} />
                </button>
                <button className="btn btn--secondary" onClick={() => navigate('boards', { companyId: 'tech' })} style={{ justifyContent: 'flex-start' }}>
                  <I.Group size={14} /> Lista de boards <span className="spacer" /><I.ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {openItem && (
        <DetailPanel
          item={openItem}
          onClose={() => setOpenItem(null)}
          onUpdate={(patch) => updateItem(openItem.id, patch)}
        />
      )}

      <CreateBoardModal
        open={showCreateBoard}
        onClose={() => setShowCreateBoard(false)}
        onCreate={(b) => { /* demo */ }}
      />
      <InviteMemberModal
        open={showInviteMember}
        onClose={() => setShowInviteMember(false)}
      />

      {showTweaks && <Tweaks state={state} setState={setState} onClose={() => setShowTweaks(false)} />}
      {!showTweaks && (
        <button className="btn btn--secondary btn--sm" onClick={() => setShowTweaks(true)}
          style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 100, boxShadow: 'var(--shadow-md)' }}>
          <I.Settings size={13} /> Tweaks
        </button>
      )}

      <Toasts />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
