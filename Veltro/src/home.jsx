// Home / Dashboard

function Home({ onNavigate, onOpenItem, allGroups }) {
  const myItems = [];
  allGroups.forEach(g => g.items.forEach(it => {
    if (it.assignee === 'u1' && !it.done) myItems.push({ ...it, group: g.name, groupColor: g.color });
  }));
  const todayItems = myItems.slice(0, 5);

  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

  return (
    <div className="page" style={{ padding: '28px 36px 60px', maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 4 }}>
          Miércoles, 22 de abril
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>
          {greet}, César 👋
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        {/* Left column */}
        <div className="vstack" style={{ gap: 20 }}>
          {/* My tasks */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', overflow: 'hidden' }}>
            <div className="hstack" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Tus tareas para hoy</div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                  {todayItems.length} de {myItems.length} asignadas a vos
                </div>
              </div>
              <span className="spacer" />
              <button className="btn btn--ghost btn--sm" onClick={() => onNavigate('mywork')}>
                Ver todo <I.ArrowRight size={12} />
              </button>
            </div>
            <div>
              {todayItems.map((it, i) => (
                <button key={it.id} onClick={() => onOpenItem(it)}
                  className="hstack"
                  style={{
                    padding: '12px 18px', gap: 12, width: '100%', textAlign: 'left',
                    borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <input type="checkbox" checked={it.done} readOnly
                    style={{ width: 15, height: 15, accentColor: 'var(--primary-mid)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, marginBottom: 3 }} className="truncate">
                      {it.name}
                    </div>
                    <div className="hstack" style={{ gap: 10, fontSize: 12, color: 'var(--fg-muted)' }}>
                      <span className="hstack" style={{ gap: 4 }}>
                        <span className="board-dot" style={{ background: it.groupColor }} />
                        Sprint 14 · {it.group}
                      </span>
                    </div>
                  </div>
                  <StatusPill id={it.status} />
                  <span style={{
                    fontSize: 12, color: isOverdue(it.due) ? 'var(--danger)' : 'var(--fg-muted)',
                    fontWeight: isOverdue(it.due) ? 500 : 400, minWidth: 60, textAlign: 'right',
                  }}>
                    {fmtDate(it.due)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Recent boards */}
          <div>
            <div className="hstack" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Boards recientes</div>
              <span className="spacer" />
              <button className="btn btn--ghost btn--sm">Ver todos</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {[
                { company: 'Tech', name: 'Sprint 14 — Q2', color: '#2563eb', boardId: 'sprint-14', members: ['u1','u2','u3','u5','u7'], items: 38, active: 'hace 12m' },
                { company: 'Tech', name: 'Bug Triage', color: '#e11d48', members: ['u3','u5','u7','u8'], items: 52, active: 'hace 1h' },
                { company: 'Design', name: 'Design System', color: '#d946ef', members: ['u2','u4','u6'], items: 41, active: 'ayer' },
                { company: 'Operaciones', name: 'Hiring Q2', color: '#6366f1', members: ['u4','u6','u8'], items: 14, active: 'hace 3 días' },
              ].map((b, i) => (
                <button key={i}
                  onClick={() => b.boardId && onNavigate('board', { boardId: b.boardId, companyId: 'tech' })}
                  style={{
                    border: '1px solid var(--border)', borderRadius: 10, padding: 0, overflow: 'hidden',
                    background: 'var(--bg)', textAlign: 'left', transition: 'all 120ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ height: 4, background: b.color }} />
                  <div style={{ padding: 14 }}>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 3 }}>{b.company}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>{b.name}</div>
                    <div className="hstack" style={{ gap: 10 }}>
                      <AvatarStack ids={b.members} max={4} size={22} />
                      <span className="spacer" />
                      <span style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>{b.items} items · {b.active}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="vstack" style={{ gap: 20 }}>
          {/* Progress rings */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', padding: 18 }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Progreso por board</div>
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 16 }}>
              Items completados este sprint
            </div>
            <div className="vstack" style={{ gap: 14 }}>
              {[
                { name: 'Sprint 14 — Q2', color: '#2563eb', done: 14, total: 38 },
                { name: 'Bug Triage',     color: '#e11d48', done: 31, total: 52 },
                { name: 'Design System',  color: '#d946ef', done: 28, total: 41 },
                { name: 'Hiring Q2',      color: '#6366f1', done: 6,  total: 14 },
              ].map((b, i) => {
                const pct = Math.round((b.done / b.total) * 100);
                return (
                  <div key={i}>
                    <div className="hstack" style={{ fontSize: 13, marginBottom: 5 }}>
                      <span className="board-dot" style={{ background: b.color, marginRight: 8 }} />
                      <span style={{ fontWeight: 500 }}>{b.name}</span>
                      <span className="spacer" />
                      <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>{b.done}/{b.total}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, minWidth: 34, textAlign: 'right' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: b.color, borderRadius: 3, transition: 'width 400ms' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Actividad reciente</div>
            </div>
            <div className="vstack" style={{ padding: '12px 18px', gap: 12 }}>
              {ACTIVITY.map(a => {
                const p = getPerson(a.user);
                return (
                  <div key={a.id} className="hstack" style={{ gap: 10, fontSize: 12.5, alignItems: 'flex-start' }}>
                    <Avatar person={p} size={22} />
                    <div style={{ flex: 1, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                      <span style={{ color: 'var(--fg-muted)' }}> {a.verb} </span>
                      <span style={{ fontWeight: 500 }}>"{a.what}"</span>
                      <div style={{ color: 'var(--fg-subtle)', fontSize: 11.5, marginTop: 2 }}>{a.when}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Home });
