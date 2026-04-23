// Login (standalone) + MyWork (simple)

function Login({ onLogin }) {
  const [email, setEmail] = useState('cesar@veltro.app');
  const [password, setPassword] = useState('••••••••••');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setTimeout(() => { setLoading(false); onLogin(); }, 700);
  };

  const triggerError = () => setError('Email o contraseña incorrectos.');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '40% 60%', height: '100vh' }}>
      {/* Form side */}
      <div style={{
        padding: '48px 56px', display: 'flex', flexDirection: 'column',
        background: 'var(--bg)',
      }}>
        <div className="hstack" style={{ gap: 10 }}>
          <VeltroMark size={28} color="var(--primary)" />
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em' }}>Veltro</span>
        </div>

        <div style={{ margin: 'auto 0', maxWidth: 360 }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-0.02em' }}>
            Bienvenido de vuelta
          </h1>
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 28px' }}>
            Iniciá sesión para seguir con tu trabajo.
          </p>

          <form onSubmit={submit} className="vstack" style={{ gap: 0 }}>
            <div className="field">
              <label className="label" htmlFor="email">Email</label>
              <input id="email" type="email" className="input"
                value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div className="field">
              <div className="hstack" style={{ marginBottom: 6 }}>
                <label className="label" htmlFor="pw" style={{ marginBottom: 0 }}>Contraseña</label>
                <span className="spacer" />
                <a href="#" style={{ fontSize: 12, color: 'var(--primary-mid)', textDecoration: 'none', fontWeight: 500 }}>Olvidé mi contraseña</a>
              </div>
              <div style={{ position: 'relative' }}>
                <input id="pw" type={showPw ? 'text' : 'password'}
                  className={cx('input', error && 'input--error')}
                  value={password} onChange={e => setPassword(e.target.value)} required
                  style={{ paddingRight: 40 }} />
                <button type="button" onClick={() => setShowPw(s => !s)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    color: 'var(--fg-muted)', padding: 4, display: 'flex',
                  }}>
                  {showPw ? <I.EyeOff size={15} /> : <I.Eye size={15} />}
                </button>
              </div>
              {error && (
                <div className="field__error">
                  <I.AlertCircle size={12} /> {error}
                </div>
              )}
            </div>

            <button type="submit" className="btn btn--primary btn--lg" disabled={loading}
              style={{ width: '100%', marginTop: 8 }}>
              {loading ? (
                <>
                  <Spinner /> Iniciando sesión…
                </>
              ) : 'Iniciar sesión'}
            </button>

            <div style={{ margin: '18px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11.5, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>o</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <button type="button" className="btn btn--secondary btn--lg" disabled
              style={{ width: '100%' }} title="Próximamente">
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.3l-6.3-5.3c-2 1.4-4.6 2.3-7.3 2.3-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.3 5.3C41 35.1 44 30 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
              Continuar con Google
              <span style={{ fontSize: 10, color: 'var(--fg-subtle)', marginLeft: 'auto' }}>Pronto</span>
            </button>
          </form>

          <div style={{ marginTop: 24, fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center' }}>
            ¿No tenés cuenta?{' '}
            <a href="#" style={{ color: 'var(--primary-mid)', fontWeight: 500, textDecoration: 'none' }}>Registrate</a>
          </div>

          {/* Demo: trigger error */}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={triggerError} style={{
              fontSize: 11, color: 'var(--fg-subtle)', textDecoration: 'underline',
            }}>mostrar estado de error</button>
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>
          © 2026 Veltro · <a href="#" style={{ color: 'inherit' }}>Privacidad</a> · <a href="#" style={{ color: 'inherit' }}>Términos</a>
        </div>
      </div>

      {/* Brand side */}
      <LoginBrandSide />
    </div>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function LoginBrandSide() {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #0d1f18 0%, #1a3a2e 55%, #0d1f18 100%)',
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: 48, color: '#fff',
    }}>
      {/* grid pattern */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#8fe8c4" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)"/>
      </svg>

      {/* glow */}
      <div style={{
        position: 'absolute', top: '-20%', right: '-10%', width: 500, height: 500,
        background: 'radial-gradient(circle, #2d8a6a40 0%, transparent 70%)', pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative' }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#8fe8c4', padding: '4px 10px', background: 'rgba(45,138,106,0.15)',
          border: '1px solid rgba(143,232,196,0.25)', borderRadius: 999,
        }}>Nuevo · v2.4</span>
      </div>

      {/* Big wordmark + mock card */}
      <div style={{ position: 'relative', marginTop: 40 }}>
        <h2 style={{
          fontSize: 54, fontWeight: 600, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.05,
          maxWidth: 520,
        }}>
          El trabajo<br/>de tu equipo,<br/><span style={{ color: '#8fe8c4' }}>sin fricción.</span>
        </h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.65)', margin: '18px 0 0', maxWidth: 460, lineHeight: 1.55 }}>
          Tableros, grupos y columnas personalizables. Multi-empresa de verdad.
          Rápido, claro y hecho para equipos de 10 a 200 personas.
        </p>

        {/* Floating mock board preview */}
        <div style={{
          marginTop: 40, width: 440,
          background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 10, padding: 14, boxShadow: '0 30px 60px rgba(0,0,0,0.4)',
          transform: 'rotate(-1.5deg)',
        }}>
          <div className="hstack" style={{ gap: 8, marginBottom: 10 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: '#2563eb' }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Sprint 14 — Q2</span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>4 de 12 hechos</span>
          </div>
          {[
            { name: 'Rate limiting con Redis', status: 'En revisión', color: '#fcd34d' },
            { name: 'Migrar API de v1 a v2', status: 'En progreso', color: '#93c5fd' },
            { name: 'SSO con Google Workspace', status: 'En progreso', color: '#93c5fd' },
            { name: 'Passkeys / WebAuthn', status: 'Hecho', color: '#86efac' },
          ].map((r, i) => (
            <div key={i} className="hstack" style={{
              padding: '8px 10px', borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.06)',
              fontSize: 12.5,
            }}>
              <span style={{
                width: 12, height: 12, borderRadius: 3, border: '1.5px solid rgba(255,255,255,0.3)',
              }} />
              <span style={{ flex: 1, marginLeft: 10 }}>{r.name}</span>
              <span style={{
                fontSize: 10.5, padding: '2px 7px', borderRadius: 3, fontWeight: 500,
                background: r.color + '30', color: r.color,
              }}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>
        <span style={{ color: '#8fe8c4', fontWeight: 600 }}>"</span> Es rápido, claro, y no nos distrae del trabajo que importa. <span style={{ color: '#8fe8c4', fontWeight: 600 }}>"</span>
        <div style={{ marginTop: 6, fontSize: 12 }}>— Ana Torres, Head of Eng · Linea Labs</div>
      </div>
    </div>
  );
}

function MyWork({ allGroups, onOpenItem }) {
  const [filter, setFilter] = useState('todo');
  const mine = [];
  allGroups.forEach(g => g.items.forEach(it => {
    if (it.assignee === 'u1') mine.push({ ...it, group: g.name, groupColor: g.color });
  }));

  const filtered = mine.filter(it => {
    if (filter === 'overdue') return !it.done && isOverdue(it.due);
    if (filter === 'today') return false;
    if (filter === 'week') return !it.done;
    if (filter === 'nodate') return !it.due;
    return true;
  });

  return (
    <div className="page" style={{ padding: '28px 36px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 16px', letterSpacing: '-0.02em' }}>Mi trabajo</h1>

      <div className="hstack" style={{ gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { id: 'todo', label: 'Todo', count: mine.length },
          { id: 'overdue', label: 'Vencidos', count: mine.filter(i => !i.done && isOverdue(i.due)).length },
          { id: 'today', label: 'Hoy' },
          { id: 'week', label: 'Esta semana', count: mine.filter(i => !i.done).length },
          { id: 'nodate', label: 'Sin fecha', count: mine.filter(i => !i.due).length },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: '5px 12px', fontSize: 13, fontWeight: 500, borderRadius: 999,
              border: '1px solid',
              borderColor: filter === f.id ? 'var(--primary)' : 'var(--border)',
              background: filter === f.id ? 'var(--primary)' : 'var(--bg)',
              color: filter === f.id ? '#fff' : 'var(--fg)',
            }}>
            {f.label}
            {f.count != null && f.count > 0 && (
              <span style={{ marginLeft: 6, opacity: 0.7 }}>{f.count}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10,
          color: 'var(--fg-muted)',
        }}>
          <I.CheckSquare size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500 }}>Sin tareas acá</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Probá con otro filtro.</div>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg)' }}>
          {filtered.map((it, i) => (
            <button key={it.id} onClick={() => onOpenItem(it)}
              className="hstack"
              style={{
                padding: '12px 18px', gap: 12, width: '100%', textAlign: 'left',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                borderLeft: `3px solid ${it.groupColor}`,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <input type="checkbox" checked={it.done} readOnly style={{ width: 15, height: 15, accentColor: 'var(--primary-mid)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500 }} className="truncate">{it.name}</div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 3 }}>Sprint 14 · {it.group}</div>
              </div>
              <StatusPill id={it.status} />
              <span style={{
                fontSize: 12, minWidth: 64, textAlign: 'right',
                color: isOverdue(it.due) && !it.done ? 'var(--danger)' : 'var(--fg-muted)',
                fontWeight: isOverdue(it.due) && !it.done ? 500 : 400,
              }}>{fmtDate(it.due)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Login, MyWork });
