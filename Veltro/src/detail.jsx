// Item Detail Panel (slide-in right)

function DetailPanel({ item, onClose, onUpdate }) {
  const [tab, setTab] = useState('comments');
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState(COMMENTS_I2);

  const [nameVal, setNameVal] = useState(item.name);
  useEffect(() => setNameVal(item.name), [item.id]);

  const person = getPerson(item.assignee);

  const statusRef = useRef(null);
  const personRef = useRef(null);
  const priRef = useRef(null);
  const [openDD, setOpenDD] = useState(null);

  const submitComment = () => {
    if (!comment.trim()) return;
    setComments(cs => [...cs, {
      id: 'cn' + Date.now(), user: 'u1', when: 'ahora', text: comment.trim(),
    }]);
    setComment('');
    toast('Comentario agregado');
  };

  return (
    <div className="detail-panel">
      {/* Header */}
      <div style={{ padding: '14px 18px 10px', borderBottom: '1px solid var(--border)' }}>
        <div className="hstack" style={{ gap: 8, fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>
          <span>Sprint 14 — Q2</span>
          <I.ChevronRight size={11} />
          <span>En desarrollo</span>
          <span className="spacer" />
          <button className="topbar__icon-btn tt" data-label="Copiar link" onClick={() => toast('Link copiado')}><I.Link size={14} /></button>
          <button className="topbar__icon-btn tt" data-label="Eliminar"><I.Trash size={14} /></button>
          <button className="topbar__icon-btn" onClick={onClose}><I.X size={15} /></button>
        </div>
        <div className="hstack" style={{ gap: 10, alignItems: 'flex-start' }}>
          <input
            type="checkbox"
            checked={item.done}
            onChange={e => onUpdate({ done: e.target.checked, status: e.target.checked ? 'done' : item.status })}
            style={{ width: 18, height: 18, marginTop: 4, accentColor: 'var(--primary-mid)' }}
          />
          <input
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={() => onUpdate({ name: nameVal.trim() || item.name })}
            onKeyDown={e => e.key === 'Enter' && e.target.blur()}
            style={{
              flex: 1, fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em',
              border: 'none', background: 'transparent', outline: 'none',
              textDecoration: item.done ? 'line-through' : 'none',
              opacity: item.done ? 0.6 : 1,
            }}
          />
        </div>
      </div>

      {/* Properties */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-subtle)', marginBottom: 10 }}>
          Propiedades
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 8, columnGap: 12, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: 'var(--fg-muted)' }}>Estado</span>
          <div ref={statusRef} style={{ cursor: 'pointer' }} onClick={() => setOpenDD(openDD === 'status' ? null : 'status')}>
            <StatusPill id={item.status} />
          </div>
          <Dropdown open={openDD === 'status'} onClose={() => setOpenDD(null)} anchorRef={statusRef}>
            {STATUS_OPTIONS.map(s => (
              <button key={s.id} className="dropdown__item" onClick={() => { onUpdate({ status: s.id, done: s.id === 'done' }); setOpenDD(null); }}>
                <StatusPill id={s.id} />
              </button>
            ))}
          </Dropdown>

          <span style={{ color: 'var(--fg-muted)' }}>Persona</span>
          <button ref={personRef} onClick={() => setOpenDD(openDD === 'person' ? null : 'person')} className="hstack" style={{ gap: 8, padding: '3px 6px', borderRadius: 4, marginLeft: -6 }}>
            {person ? (<><Avatar person={person} size={22} /><span>{person.name}</span></>) : <span className="subtle">Sin asignar</span>}
          </button>
          <Dropdown open={openDD === 'person'} onClose={() => setOpenDD(null)} anchorRef={personRef} width={220}>
            {PEOPLE.map(p => (
              <button key={p.id} className="dropdown__item" onClick={() => { onUpdate({ assignee: p.id }); setOpenDD(null); }}>
                <Avatar person={p} size={22} /><span>{p.name}</span>
              </button>
            ))}
          </Dropdown>

          <span style={{ color: 'var(--fg-muted)' }}>Fecha</span>
          <span className="hstack" style={{ gap: 6, color: isOverdue(item.due) && !item.done ? 'var(--danger)' : 'var(--fg)' }}>
            <I.Calendar size={13} /> {item.due ? fmtDate(item.due) : <span className="subtle">Sin fecha</span>}
          </span>

          <span style={{ color: 'var(--fg-muted)' }}>Prioridad</span>
          <div ref={priRef} onClick={() => setOpenDD(openDD === 'priority' ? null : 'priority')} style={{ cursor: 'pointer' }}>
            <PriorityPill id={item.priority} />
          </div>
          <Dropdown open={openDD === 'priority'} onClose={() => setOpenDD(null)} anchorRef={priRef}>
            {PRIORITY_OPTIONS.map(p => (
              <button key={p.id} className="dropdown__item" onClick={() => { onUpdate({ priority: p.id }); setOpenDD(null); }}>
                <PriorityPill id={p.id} />
              </button>
            ))}
          </Dropdown>

          <span style={{ color: 'var(--fg-muted)' }}>Puntos</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{item.estimate ?? '—'}</span>
        </div>
      </div>

      {/* Description placeholder */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-subtle)', marginBottom: 6 }}>
          Descripción
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.55 }}>
          Reemplazar el cliente <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>BillingV1Client</code> por <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>BillingV2Client</code> en los 8 endpoints de subscriptions. Mantener backcompat via header <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 3 }}>X-API-Version</code>.
        </div>
      </div>

      {/* Tabs */}
      <div className="hstack" style={{ padding: '0 18px', borderBottom: '1px solid var(--border)', gap: 2 }}>
        {[
          { id: 'comments', label: 'Comentarios', icon: <I.MessageSquare size={13} />, count: comments.length },
          { id: 'activity', label: 'Actividad',   icon: <I.Activity size={13} /> },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="hstack"
            style={{
              gap: 6, padding: '10px 10px', fontSize: 13, fontWeight: 500,
              color: tab === t.id ? 'var(--fg)' : 'var(--fg-subtle)',
              borderBottom: tab === t.id ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {t.icon} {t.label}
            {t.count != null && <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 18px' }}>
        {tab === 'comments' && (
          <div className="vstack" style={{ gap: 14 }}>
            {comments.map(c => {
              const p = getPerson(c.user);
              return (
                <div key={c.id} className="hstack" style={{ alignItems: 'flex-start', gap: 10 }}>
                  <Avatar person={p} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="hstack" style={{ gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{c.when}</span>
                    </div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{c.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === 'activity' && (
          <div className="vstack" style={{ gap: 10 }}>
            {ACTIVITY.map(a => {
              const p = getPerson(a.user);
              return (
                <div key={a.id} className="hstack" style={{ gap: 10, fontSize: 13 }}>
                  <Avatar person={p} size={22} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                    <span style={{ color: 'var(--fg-muted)' }}> {a.verb} </span>
                    <span style={{ fontWeight: 500 }}>"{a.what}"</span>
                    {a.to && <span style={{ color: 'var(--fg-muted)' }}> → <strong style={{ color: 'var(--fg)', fontWeight: 500 }}>{a.to}</strong></span>}
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--fg-subtle)' }}>{a.when}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Comment input */}
      {tab === 'comments' && (
        <div style={{ padding: 14, borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div style={{ position: 'relative' }}>
            <textarea
              placeholder="Escribí un comentario… Presioná ⌘↵ para enviar"
              value={comment}
              onChange={e => setComment(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitComment();
              }}
              className="input"
              style={{
                resize: 'none', minHeight: 70, fontSize: 13.5, lineHeight: 1.5,
                paddingRight: 46,
              }}
            />
            <button
              onClick={submitComment}
              disabled={!comment.trim()}
              className="btn btn--primary"
              style={{ position: 'absolute', bottom: 8, right: 8, padding: 6 }}>
              <I.Send size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { DetailPanel });
