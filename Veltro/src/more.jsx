// Lista de boards, Modal crear board, Settings miembros, Invitación

// ----- Board List -----
function BoardList({ companyId, onOpenBoard, onNewBoard }) {
  const company = COMPANIES.find(c => c.id === companyId) || COMPANIES[0];
  const boards = company.boards;

  return (
    <div className="page" style={{ padding: '28px 36px 60px', maxWidth: 1280, margin: '0 auto' }}>
      <div className="hstack" style={{ marginBottom: 24 }}>
        <div>
          <div className="hstack" style={{ gap: 8, fontSize: 12, color: 'var(--fg-muted)', marginBottom: 6 }}>
            <I.Building size={13} /> <span>Linea Labs</span>
            <I.ChevronRight size={11} />
            <span>{company.name}</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>{company.name}</h1>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>
            {boards.length} boards · 12 miembros
          </div>
        </div>
        <span className="spacer" />
        <button className="btn btn--secondary btn--sm"><I.Users size={13} /> Miembros</button>
        <button className="btn btn--primary btn--sm" onClick={onNewBoard}>
          <I.Plus size={13} /> Nuevo board
        </button>
      </div>

      {boards.length === 0 ? <BoardsEmpty onNew={onNewBoard} /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {boards.map(b => (
            <BoardCard key={b.id} board={b} onOpen={() => onOpenBoard(b.id, companyId)} />
          ))}
          <button onClick={onNewBoard} style={{
            border: '1.5px dashed var(--border)', borderRadius: 10, minHeight: 180,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, color: 'var(--fg-muted)', background: 'transparent',
            transition: 'all 120ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-mid)'; e.currentTarget.style.color = 'var(--primary-mid)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--fg-muted)'; }}
          >
            <I.Plus size={22} />
            <span style={{ fontSize: 13.5, fontWeight: 500 }}>Crear nuevo board</span>
          </button>
        </div>
      )}
    </div>
  );
}

function BoardCard({ board, onOpen }) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const members = ['u1','u2','u3','u5','u7'].slice(0, 4);

  return (
    <div
      onClick={onOpen}
      style={{
        border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
        background: 'var(--bg)', cursor: 'pointer', transition: 'all 150ms',
        display: 'flex', flexDirection: 'column',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}
    >
      <div style={{ height: 5, background: board.color }} />
      <div style={{ padding: 16, flex: 1 }}>
        <div className="hstack" style={{ marginBottom: 4 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{board.name}</h3>
          <span className="spacer" />
          <button ref={menuRef}
            onClick={(e) => { e.stopPropagation(); setMenu(m => !m); }}
            className="topbar__icon-btn" style={{ width: 24, height: 24 }}>
            <I.MoreHorizontal size={14} />
          </button>
          <Dropdown open={menu} onClose={() => setMenu(false)} anchorRef={menuRef} align="right" width={160}>
            <button className="dropdown__item" onClick={(e) => { e.stopPropagation(); setMenu(false); toast('Duplicar board (demo)'); }}>
              <I.Link size={13} /> Duplicar
            </button>
            <button className="dropdown__item" onClick={(e) => { e.stopPropagation(); setMenu(false); toast('Editar board (demo)'); }}>
              <I.Settings size={13} /> Editar
            </button>
            <div className="dropdown__divider" />
            <button className="dropdown__item" style={{ color: 'var(--danger)' }}
              onClick={(e) => { e.stopPropagation(); setMenu(false); toast('Board eliminado'); }}>
              <I.Trash size={13} /> Eliminar
            </button>
          </Dropdown>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', minHeight: 36, lineHeight: 1.5 }}>
          Tablero con las historias y bugs priorizados del equipo.
        </div>
      </div>
      <div className="hstack" style={{
        padding: '10px 16px', borderTop: '1px solid var(--border)',
        background: 'var(--surface)', gap: 10, fontSize: 11.5, color: 'var(--fg-muted)',
      }}>
        <AvatarStack ids={members} max={3} size={20} />
        <span className="spacer" />
        <span className="hstack" style={{ gap: 4 }}><I.CheckSquare size={11} /> {board.items}</span>
        <span className="hstack" style={{ gap: 4 }}><I.Lock size={11} /> Privado</span>
      </div>
    </div>
  );
}

function BoardsEmpty({ onNew }) {
  return (
    <div style={{
      border: '1px dashed var(--border)', borderRadius: 12, padding: '56px 24px',
      textAlign: 'center', background: 'var(--surface)',
    }}>
      <div style={{
        width: 64, height: 64, margin: '0 auto 16px', borderRadius: 14,
        background: 'var(--primary-light)', color: 'var(--primary-mid)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <I.Group size={28} />
      </div>
      <h3 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 6px' }}>Todavía no hay boards</h3>
      <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 18px', maxWidth: 360, marginInline: 'auto', lineHeight: 1.5 }}>
        Creá el primero para empezar a organizar el trabajo de tu equipo.
      </p>
      <button className="btn btn--primary" onClick={onNew}>
        <I.Plus size={14} /> Crear board
      </button>
    </div>
  );
}

// ----- Create Board Modal -----
function CreateBoardModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [color, setColor] = useState(COLOR_SWATCHES[2]);
  const [visibility, setVisibility] = useState('private');

  useEffect(() => {
    if (open) { setName(''); setDesc(''); setColor(COLOR_SWATCHES[2]); setVisibility('private'); }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), desc, color, visibility });
    onClose();
    toast(`Board "${name.trim()}" creado`);
  };

  const visOptions = [
    { id: 'private',  icon: <I.Lock size={14} />,    title: 'Privado',  sub: 'Solo vos y los miembros invitados' },
    { id: 'company',  icon: <I.Building size={14} />, title: 'Empresa',  sub: 'Todos los miembros de la empresa' },
    { id: 'groups',   icon: <I.Users size={14} />,   title: 'Grupos',   sub: 'Grupos específicos' },
  ];

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 580 }}>
        <div className="modal__header">
          <div className="modal__title">Nuevo board</div>
          <button className="topbar__icon-btn" onClick={onClose}><I.X size={15} /></button>
        </div>
        <div className="modal__body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 18 }}>
            <div>
              <div className="field">
                <label className="label">Nombre del board</label>
                <input className="input" autoFocus value={name} onChange={e => setName(e.target.value)}
                  placeholder="ej: Campaña Q1 2026" />
              </div>
              <div className="field">
                <label className="label">Descripción <span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}>· opcional</span></label>
                <textarea className="input" value={desc} onChange={e => setDesc(e.target.value)}
                  rows={2} style={{ resize: 'none', lineHeight: 1.5 }}
                  placeholder="¿De qué se trata este tablero?" />
              </div>
              <div className="field">
                <label className="label">Color</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {COLOR_SWATCHES.map(c => (
                    <button key={c} onClick={() => setColor(c)}
                      style={{
                        width: 26, height: 26, borderRadius: 6, background: c,
                        border: color === c ? '2px solid var(--fg)' : '2px solid transparent',
                        boxShadow: color === c ? '0 0 0 2px var(--bg)' : 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                      {color === c && <I.Check size={14} style={{ color: '#fff' }} />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {/* Preview */}
            <div>
              <label className="label">Vista previa</label>
              <div style={{
                border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                background: 'var(--bg)',
              }}>
                <div style={{ height: 5, background: color }} />
                <div style={{ padding: 12 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, marginBottom: 4,
                    color: name ? 'var(--fg)' : 'var(--fg-subtle)',
                  }}>
                    {name || 'Nombre'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--fg-muted)', lineHeight: 1.4, minHeight: 26 }}>
                    {desc || <span style={{ color: 'var(--fg-subtle)' }}>Descripción…</span>}
                  </div>
                </div>
                <div style={{
                  padding: '8px 12px', borderTop: '1px solid var(--border)',
                  background: 'var(--surface)', fontSize: 10.5, color: 'var(--fg-muted)',
                  display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <I.Lock size={10} /> {visOptions.find(v => v.id === visibility).title}
                </div>
              </div>
            </div>
          </div>

          {/* Visibility */}
          <div className="field" style={{ marginTop: 6 }}>
            <label className="label">Visibilidad</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {visOptions.map(v => (
                <button key={v.id} onClick={() => setVisibility(v.id)}
                  style={{
                    padding: '12px 12px', borderRadius: 8, textAlign: 'left',
                    border: '1px solid',
                    borderColor: visibility === v.id ? 'var(--primary-mid)' : 'var(--border)',
                    background: visibility === v.id ? 'var(--primary-light)' : 'var(--bg)',
                    color: 'var(--fg)',
                  }}>
                  <div className="hstack" style={{ gap: 6, marginBottom: 4, color: visibility === v.id ? 'var(--primary-mid)' : 'var(--fg-muted)' }}>
                    {v.icon}
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{v.title}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', lineHeight: 1.4 }}>
                    {v.sub}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary btn--sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary btn--sm" onClick={submit} disabled={!name.trim()}>
            Crear board
          </button>
        </div>
      </div>
    </div>
  );
}

// ----- Settings: Members -----
const ROLE_OPTIONS = [
  { id: 'owner',  label: 'Owner',   bg: '#dcfce7', fg: '#15803d', dark_bg: '#14362a', dark_fg: '#86efac' },
  { id: 'admin',  label: 'Admin',   bg: '#dbeafe', fg: '#1e40af', dark_bg: '#1e3a5f', dark_fg: '#93c5fd' },
  { id: 'member', label: 'Miembro', bg: '#f1f5f9', fg: '#475569', dark_bg: '#252e2a', dark_fg: '#94a3b8' },
  { id: 'guest',  label: 'Invitado', bg: '#fef3c7', fg: '#92400e', dark_bg: '#3d2f10', dark_fg: '#fcd34d' },
];

function RoleBadge({ id, onClick }) {
  const r = ROLE_OPTIONS.find(x => x.id === id);
  if (!r) return null;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return (
    <span onClick={onClick} style={{
      fontSize: 11.5, fontWeight: 500, padding: '2px 8px', borderRadius: 999,
      background: isDark ? r.dark_bg : r.bg, color: isDark ? r.dark_fg : r.fg,
      cursor: onClick ? 'pointer' : 'default',
    }}>{r.label}</span>
  );
}

function SettingsMembers({ onInvite }) {
  const members = [
    { id: 'u1', role: 'owner',  companies: ['Tech'],                   joined: '2025-11-03' },
    { id: 'u2', role: 'admin',  companies: ['Design', 'Tech'],         joined: '2025-12-14' },
    { id: 'u3', role: 'member', companies: ['Tech'],                   joined: '2026-01-20' },
    { id: 'u4', role: 'admin',  companies: ['Operaciones'],            joined: '2026-02-08' },
    { id: 'u5', role: 'member', companies: ['Tech'],                   joined: '2026-02-15' },
    { id: 'u6', role: 'member', companies: ['Design'],                 joined: '2026-03-02' },
    { id: 'u7', role: 'member', companies: ['Tech'],                   joined: '2026-03-19' },
    { id: 'u8', role: 'guest',  companies: ['Operaciones'],            joined: '2026-04-10' },
  ];

  const pendingInvites = [
    { email: 'maria.lopez@agencia.com', role: 'member', sent: '2026-04-18', expires: '2026-04-25' },
    { email: 'rodrigo@linealabs.app',   role: 'admin',  sent: '2026-04-20', expires: '2026-04-27' },
  ];

  return (
    <div className="page" style={{ padding: '28px 36px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div className="hstack" style={{ marginBottom: 22 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>Miembros</h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: 13, margin: '4px 0 0' }}>
            {members.length} miembros · {pendingInvites.length} invitaciones pendientes
          </p>
        </div>
        <span className="spacer" />
        <div className="hstack" style={{
          padding: '6px 10px', background: 'var(--surface)', borderRadius: 6,
          border: '1px solid var(--border)', width: 240,
        }}>
          <I.Search size={13} style={{ color: 'var(--fg-muted)' }} />
          <input placeholder="Buscar miembros…" style={{
            background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: 13,
          }} />
        </div>
        <button className="btn btn--primary btn--sm" onClick={onInvite}>
          <I.Plus size={13} /> Invitar miembro
        </button>
      </div>

      {/* Members table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg)', marginBottom: 28 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 100px 1fr 110px 60px',
          padding: '10px 16px', background: 'var(--surface)',
          fontSize: 11.5, fontWeight: 600, color: 'var(--fg-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>Miembro</div><div>Email</div><div>Rol</div><div>Empresas</div><div>Ingreso</div><div></div>
        </div>
        {members.map((m, i) => {
          const p = getPerson(m.id);
          return (
            <div key={m.id} style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 100px 1fr 110px 60px',
              padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              alignItems: 'center', fontSize: 13.5,
            }}>
              <div className="hstack" style={{ gap: 10 }}>
                <Avatar person={p} size={28} />
                <span style={{ fontWeight: 500 }}>{p.name}</span>
              </div>
              <div style={{ color: 'var(--fg-muted)', fontSize: 13 }} className="truncate">
                {p.name.toLowerCase().replace(/\s+/g, '.').replace(/[áéíóú]/g, c => 'aeiou'[{á:0,é:1,í:2,ó:3,ú:4}[c]])}@linealabs.app
              </div>
              <div><RoleBadge id={m.role} /></div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {m.companies.map(c => (
                  <span key={c} style={{
                    fontSize: 11.5, padding: '2px 7px', borderRadius: 4,
                    background: 'var(--surface-2)', color: 'var(--fg-muted)',
                  }}>{c}</span>
                ))}
              </div>
              <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{fmtDate(m.joined)}</div>
              <div style={{ textAlign: 'right' }}>
                <button className="topbar__icon-btn" style={{ width: 26, height: 26 }}>
                  <I.MoreHorizontal size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending invites */}
      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 10px' }}>Invitaciones pendientes</h2>
      <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg)' }}>
        {pendingInvites.map((inv, i) => (
          <div key={inv.email} className="hstack" style={{
            padding: '12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)',
            gap: 12, fontSize: 13.5,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'var(--surface-2)', color: 'var(--fg-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <I.Inbox size={13} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{inv.email}</div>
              <div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 2 }}>
                Enviada {fmtDate(inv.sent)} · Vence {fmtDate(inv.expires)}
              </div>
            </div>
            <RoleBadge id={inv.role} />
            <span style={{
              fontSize: 11.5, padding: '2px 8px', borderRadius: 999,
              background: '#fef3c7', color: '#92400e', fontWeight: 500,
            }}>
              <I.Clock size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} /> Pendiente
            </span>
            <button className="btn btn--ghost btn--sm" onClick={() => toast('Invitación reenviada')}>Reenviar</button>
            <button className="btn btn--ghost btn--sm" style={{ color: 'var(--danger)' }}
              onClick={() => toast('Invitación cancelada')}>Cancelar</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----- Invite Member Modal -----
function InviteMemberModal({ open, onClose }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [company, setCompany] = useState('tech');

  useEffect(() => { if (open) { setEmail(''); setRole('member'); setCompany('tech'); } }, [open]);
  if (!open) return null;

  const submit = () => {
    if (!email.trim()) return;
    onClose();
    toast(`Invitación enviada a ${email}`);
  };

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 440 }}>
        <div className="modal__header">
          <div className="modal__title">Invitar miembro</div>
          <button className="topbar__icon-btn" onClick={onClose}><I.X size={15} /></button>
        </div>
        <div className="modal__body">
          <div className="field">
            <label className="label">Email</label>
            <input className="input" autoFocus type="email" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="nombre@empresa.com" />
            <div className="field__hint">Podés agregar varios separados por coma.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field">
              <label className="label">Rol</label>
              <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                <option value="member">Miembro</option>
                <option value="admin">Admin</option>
                <option value="guest">Invitado</option>
              </select>
            </div>
            <div className="field">
              <label className="label">Empresa</label>
              <select className="input" value={company} onChange={e => setCompany(e.target.value)}>
                {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="modal__footer">
          <button className="btn btn--secondary btn--sm" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary btn--sm" onClick={submit} disabled={!email.trim()}>
            <I.Send size={12} /> Enviar invitación
          </button>
        </div>
      </div>
    </div>
  );
}

// ----- Accept Invitation Page -----
function InvitePage({ valid = true, onAccept, onBack }) {
  return (
    <div style={{
      height: '100vh', width: '100vw',
      background: 'linear-gradient(135deg, #0d1f18 0%, #1a3a2e 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, position: 'relative', overflow: 'hidden',
    }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.06 }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="igrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#8fe8c4" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#igrid)"/>
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, position: 'relative', width: '100%', maxWidth: 440 }}>
        <div className="hstack" style={{ gap: 10, color: '#fff' }}>
          <VeltroMark size={28} color="#fff" />
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Veltro</span>
        </div>

        {valid ? (
          <div style={{
            background: 'var(--bg)', borderRadius: 14, padding: 32,
            boxShadow: '0 30px 80px rgba(0,0,0,0.4)',
            width: '100%', textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14,
              background: 'linear-gradient(135deg, var(--primary-mid), var(--primary))',
              color: '#fff', fontSize: 22, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              letterSpacing: '-0.02em',
            }}>LL</div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px', letterSpacing: '-0.02em' }}>
              Te invitaron a unirte a <span style={{ color: 'var(--primary-mid)' }}>Linea Labs</span>
            </h1>
            <div style={{ fontSize: 13.5, color: 'var(--fg-muted)', marginBottom: 20 }}>
              cesar@linealabs.app · Rol: <strong style={{ color: 'var(--fg)', fontWeight: 500 }}>Miembro</strong>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn--primary btn--lg" onClick={onAccept}>
                Aceptar y entrar <I.ArrowRight size={14} />
              </button>
              <button className="btn btn--secondary btn--lg">
                Crear cuenta y aceptar
              </button>
            </div>

            <div style={{
              marginTop: 18, padding: '10px 14px', borderRadius: 8,
              background: 'var(--surface)', fontSize: 12, color: 'var(--fg-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <I.Clock size={12} /> Esta invitación vence el 27 de abril.
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--bg)', borderRadius: 14, padding: 32,
            boxShadow: '0 30px 80px rgba(0,0,0,0.4)', width: '100%', textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, margin: '0 auto 16px', borderRadius: 14,
              background: '#fee2e2', color: '#b91c1c',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <I.AlertCircle size={28} />
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 6px' }}>
              Esta invitación no es válida
            </h1>
            <p style={{ fontSize: 13.5, color: 'var(--fg-muted)', margin: '0 0 20px' }}>
              El link puede haber expirado o ya fue utilizado.
            </p>
            <button className="btn btn--secondary btn--lg" onClick={onBack}>Ir al inicio</button>
          </div>
        )}

        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
          ¿Problemas? Escribinos a <a href="#" style={{ color: '#8fe8c4' }}>soporte@veltro.app</a>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  BoardList, CreateBoardModal, SettingsMembers, InviteMemberModal, InvitePage,
});
