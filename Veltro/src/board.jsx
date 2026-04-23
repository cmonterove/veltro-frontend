// Board Table View — the hero screen

function BoardHeader({ board, onOpenMembers }) {
  const memberIds = ['u1','u2','u3','u5','u7','u8'];
  return (
    <div style={{ padding: '18px 24px 0' }}>
      <div className="hstack" style={{ gap: 12, marginBottom: 4 }}>
        <span className="board-dot" style={{ background: board.color, width: 14, height: 14, borderRadius: 4 }} />
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0, letterSpacing: '-0.01em' }}>{board.name}</h1>
        <span className="badge" style={{ background: 'var(--surface)', color: 'var(--fg-muted)', border: '1px solid var(--border)' }}>
          <I.Lock size={11} /> Privado
        </span>
        <span className="spacer" />
        <AvatarStack ids={memberIds} max={5} size={26} />
        <button className="btn btn--ghost btn--sm" onClick={onOpenMembers}>
          <I.Plus size={13} /> Invitar
        </button>
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginLeft: 26, marginBottom: 14 }}>
        Trabajo del sprint actual — cerramos el 2 de mayo.
      </div>

      {/* Tabs */}
      <div className="hstack" style={{ gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 0 }}>
        {[
          { id: 'table',    label: 'Tabla',      icon: <I.Group size={14} />,    active: true },
          { id: 'kanban',   label: 'Kanban',     icon: <I.Kanban size={14} />,   soon: true },
          { id: 'calendar', label: 'Calendario', icon: <I.Calendar size={14} />, soon: true },
          { id: 'gantt',    label: 'Gantt',      icon: <I.Activity size={14} />, soon: true },
        ].map(t => (
          <button key={t.id}
            className="hstack"
            style={{
              gap: 6, padding: '9px 12px', fontSize: 13, fontWeight: 500,
              color: t.active ? 'var(--fg)' : 'var(--fg-subtle)',
              borderBottom: t.active ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1,
              cursor: t.soon ? 'default' : 'pointer',
            }}>
            {t.icon} {t.label}
            {t.soon && (
              <span style={{
                fontSize: 10, padding: '1px 5px', background: 'var(--surface-2)',
                borderRadius: 3, color: 'var(--fg-subtle)',
              }}>Pronto</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toolbar({ onAdd }) {
  return (
    <div className="hstack" style={{
      padding: '10px 24px', gap: 4, borderBottom: '1px solid var(--border)',
      background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 5,
    }}>
      <button className="btn btn--primary btn--sm" onClick={onAdd}>
        <I.Plus size={13} /> Agregar item
      </button>
      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 6px' }} />
      {[
        { icon: <I.Filter size={13} />, label: 'Filtrar', count: 2 },
        { icon: <I.ArrowUpDown size={13} />, label: 'Ordenar' },
        { icon: <I.Group size={13} />, label: 'Agrupar: Estado' },
        { icon: <I.EyeOff size={13} />, label: 'Ocultar' },
      ].map((b, i) => (
        <button key={i} className="btn btn--ghost btn--sm">
          {b.icon} {b.label}
          {b.count && (
            <span style={{
              background: 'var(--primary-light)', color: 'var(--primary)',
              padding: '0 5px', borderRadius: 8, fontSize: 11, fontWeight: 600, marginLeft: 2,
            }}>{b.count}</span>
          )}
        </button>
      ))}
      <span className="spacer" />
      <button className="btn btn--ghost btn--sm"><I.Search size={13} /> Buscar</button>
      <button className="btn btn--ghost btn--sm btn--icon"><I.MoreHorizontal size={14} /></button>
    </div>
  );
}

// --- Table ---
const COLS = [
  { id: 'name',     label: 'Item',      width: '38%' },
  { id: 'status',   label: 'Estado',    width: 130 },
  { id: 'assignee', label: 'Persona',   width: 160 },
  { id: 'due',      label: 'Fecha',     width: 100 },
  { id: 'priority', label: 'Prioridad', width: 100 },
  { id: 'estimate', label: 'Puntos',    width: 80 },
];

function BoardTable({ groups, setGroups, onOpenItem }) {
  return (
    <div style={{ padding: '0 24px 80px' }}>
      {/* Column header */}
      <div className="table-header" style={{
        display: 'grid',
        gridTemplateColumns: `44px ${COLS[0].width} ${COLS.slice(1).map(c => typeof c.width === 'number' ? `${c.width}px` : c.width).join(' ')} 44px`,
        alignItems: 'center',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        fontSize: 11.5, fontWeight: 600, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em',
        position: 'sticky', top: 42, zIndex: 4,
        marginTop: 14,
        borderTopLeftRadius: 6, borderTopRightRadius: 6,
        border: '1px solid var(--border)',
      }}>
        <div />
        {COLS.map(c => (
          <div key={c.id} style={{ padding: '10px 10px', borderLeft: '1px solid var(--border)' }}>{c.label}</div>
        ))}
        <div style={{ borderLeft: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
          <button className="topbar__icon-btn" style={{ width: 24, height: 24 }} title="Agregar columna">
            <I.Plus size={13} />
          </button>
        </div>
      </div>

      {groups.map((g, gi) => (
        <BoardGroup
          key={g.id}
          group={g}
          onToggle={() => setGroups(gs => gs.map((x,i) => i===gi ? { ...x, collapsed: !x.collapsed } : x))}
          onUpdateItem={(itemId, patch) => setGroups(gs => gs.map((x,i) => i===gi ? {
            ...x, items: x.items.map(it => it.id === itemId ? { ...it, ...patch } : it),
          } : x))}
          onAddItem={(name) => setGroups(gs => gs.map((x,i) => i===gi ? {
            ...x, items: [...x.items, {
              id: 'new-' + Date.now(), name,
              status: 'todo', assignee: 'u1', due: null, priority: 'med', estimate: null, done: false,
            }],
          } : x))}
          onReorder={(fromIdx, toIdx) => setGroups(gs => gs.map((x,i) => {
            if (i !== gi) return x;
            const arr = [...x.items];
            const [moved] = arr.splice(fromIdx, 1);
            arr.splice(toIdx, 0, moved);
            return { ...x, items: arr };
          }))}
          onRenameGroup={(name) => setGroups(gs => gs.map((x,i) => i===gi ? { ...x, name } : x))}
          onOpenItem={onOpenItem}
        />
      ))}

      <button className="hstack" style={{
        padding: '10px 12px', color: 'var(--fg-muted)', fontSize: 13,
        border: '1px dashed var(--border)', borderTop: 'none',
        width: '100%', gap: 6, background: 'transparent',
        borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
      }}>
        <I.Plus size={14} /> Agregar grupo
      </button>
    </div>
  );
}

function BoardGroup({ group, onToggle, onUpdateItem, onAddItem, onReorder, onRenameGroup, onOpenItem }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(group.name);

  const submitAdd = () => {
    if (newName.trim()) { onAddItem(newName.trim()); toast(`Se agregó "${newName.trim()}"`); }
    setNewName(''); setAdding(false);
  };

  const gridTemplate = `44px ${COLS[0].width} ${COLS.slice(1).map(c => typeof c.width === 'number' ? `${c.width}px` : c.width).join(' ')} 44px`;

  return (
    <div style={{ border: '1px solid var(--border)', borderTop: 'none' }}>
      {/* Group header */}
      <div className="hstack" style={{
        padding: '8px 12px', gap: 10, background: 'var(--bg)',
        borderBottom: group.collapsed ? 'none' : '1px solid var(--border)',
        borderLeft: `3px solid ${group.color}`,
      }}>
        <button onClick={onToggle} style={{ color: 'var(--fg-muted)', display: 'flex' }}>
          <I.ChevronRight size={14} style={{
            transform: group.collapsed ? 'rotate(0)' : 'rotate(90deg)',
            transition: 'transform 150ms',
          }} />
        </button>
        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={() => { onRenameGroup(nameVal.trim() || group.name); setEditingName(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') { setNameVal(group.name); setEditingName(false); }
            }}
            style={{
              fontSize: 14, fontWeight: 600, color: group.color,
              border: '1px solid var(--primary-mid)', borderRadius: 4,
              padding: '2px 6px', background: 'var(--bg)', outline: 'none',
            }}
          />
        ) : (
          <button onClick={() => setEditingName(true)} style={{
            fontSize: 14, fontWeight: 600, color: group.color,
          }}>
            {group.name}
          </button>
        )}
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
        </span>
        <span className="spacer" />
        <button className="btn btn--ghost btn--sm" onClick={() => setAdding(true)}>
          <I.Plus size={12} /> Agregar
        </button>
        <button className="topbar__icon-btn" style={{ width: 26, height: 26 }}>
          <I.MoreHorizontal size={14} />
        </button>
      </div>

      {!group.collapsed && (
        <>
          {group.items.map((item, idx) => (
            <Row
              key={item.id}
              item={item}
              groupColor={group.color}
              gridTemplate={gridTemplate}
              isDragging={dragIdx === idx}
              isOver={overIdx === idx}
              onUpdate={(patch) => onUpdateItem(item.id, patch)}
              onOpen={() => onOpenItem(item)}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setOverIdx(idx); }}
              onDrop={() => {
                if (dragIdx !== null && dragIdx !== idx) {
                  onReorder(dragIdx, idx);
                  toast('Orden actualizado');
                }
                setDragIdx(null); setOverIdx(null);
              }}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            />
          ))}

          {/* Add-item row */}
          {adding ? (
            <div style={{
              display: 'grid', gridTemplateColumns: gridTemplate, alignItems: 'center',
              borderLeft: `3px solid ${group.color}`, background: 'var(--surface)',
              minHeight: 44, padding: '0',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <I.Plus size={14} style={{ color: 'var(--primary-mid)' }} />
              </div>
              <div style={{ padding: '0 10px', borderLeft: '1px solid var(--border)', height: '100%', display: 'flex', alignItems: 'center' }}>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onBlur={submitAdd}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitAdd();
                    if (e.key === 'Escape') { setNewName(''); setAdding(false); }
                  }}
                  placeholder="Nombre del item…"
                  style={{
                    width: '100%', border: 'none', background: 'transparent',
                    outline: 'none', fontSize: 13.5,
                  }}
                />
              </div>
              {COLS.slice(1).map(c => <div key={c.id} style={{ borderLeft: '1px solid var(--border)', height: '100%' }} />)}
              <div style={{ borderLeft: '1px solid var(--border)', height: '100%' }} />
            </div>
          ) : (
            <button onClick={() => setAdding(true)} style={{
              padding: '9px 12px 9px 58px', color: 'var(--fg-muted)', fontSize: 13,
              borderLeft: `3px solid ${group.color}`,
              width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--bg)',
            }}>
              <I.Plus size={13} /> Agregar item
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ---- Row ----

function Row({ item, groupColor, gridTemplate, isDragging, isOver, onUpdate, onOpen, onDragStart, onDragOver, onDrop, onDragEnd }) {
  const [hovered, setHovered] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(item.name);

  const statusRef = useRef(null);
  const personRef = useRef(null);
  const priRef = useRef(null);
  const [openDD, setOpenDD] = useState(null); // 'status' | 'person' | 'priority'

  const person = getPerson(item.assignee);
  const overdue = isOverdue(item.due) && !item.done;

  return (
    <div
      draggable={!editingName}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        alignItems: 'center',
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${groupColor}`,
        background: isOver ? 'var(--primary-light)' : (hovered ? 'var(--surface)' : 'var(--bg)'),
        opacity: isDragging ? 0.4 : 1,
        minHeight: 44,
        transition: 'background 80ms',
      }}
    >
      {/* drag + checkbox */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={{ opacity: hovered ? 1 : 0, color: 'var(--fg-subtle)', cursor: 'grab' }}>
          <I.Grip size={12} />
        </span>
        <input
          type="checkbox"
          checked={item.done}
          onChange={e => {
            onUpdate({ done: e.target.checked, status: e.target.checked ? 'done' : item.status });
            if (e.target.checked) toast('Item marcado como hecho');
          }}
          onClick={e => e.stopPropagation()}
          style={{
            width: 15, height: 15, accentColor: 'var(--primary-mid)', cursor: 'pointer',
          }}
        />
      </div>

      {/* Name */}
      <div style={{
        padding: '0 10px', borderLeft: '1px solid var(--border)', height: '100%',
        display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
      }}>
        {editingName ? (
          <input
            autoFocus
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={() => { onUpdate({ name: nameVal.trim() || item.name }); setEditingName(false); }}
            onKeyDown={e => {
              if (e.key === 'Enter') e.target.blur();
              if (e.key === 'Escape') { setNameVal(item.name); setEditingName(false); }
            }}
            style={{
              width: '100%', fontSize: 13.5,
              border: '1px solid var(--primary-mid)', borderRadius: 4,
              padding: '4px 6px', background: 'var(--bg)', outline: 'none',
            }}
          />
        ) : (
          <button
            onClick={() => setEditingName(true)}
            onDoubleClick={onOpen}
            title="Click para editar, doble click para abrir"
            style={{
              textAlign: 'left', fontSize: 13.5, color: 'var(--fg)',
              textDecoration: item.done ? 'line-through' : 'none',
              opacity: item.done ? 0.55 : 1, flex: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >{item.name}</button>
        )}
        <button
          onClick={onOpen}
          className="tt" data-label="Abrir detalle"
          style={{
            opacity: hovered && !editingName ? 1 : 0,
            color: 'var(--fg-muted)', padding: 3, borderRadius: 4, display: 'flex',
          }}>
          <I.ArrowRight size={12} />
        </button>
      </div>

      {/* Status */}
      <div style={{ padding: '0 8px', borderLeft: '1px solid var(--border)', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div ref={statusRef} onClick={() => setOpenDD(openDD === 'status' ? null : 'status')} style={{ width: '100%' }}>
          <StatusPill id={item.status} onClick={() => {}} style={{ minWidth: '100%' }} />
        </div>
        <Dropdown open={openDD === 'status'} onClose={() => setOpenDD(null)} anchorRef={statusRef} width={170}>
          {STATUS_OPTIONS.map(s => (
            <button key={s.id} className="dropdown__item"
              onClick={() => { onUpdate({ status: s.id, done: s.id === 'done' }); setOpenDD(null); }}>
              <StatusPill id={s.id} style={{ minWidth: 110, pointerEvents: 'none' }} />
              {item.status === s.id && <I.Check size={13} style={{ marginLeft: 'auto', color: 'var(--primary-mid)' }} />}
            </button>
          ))}
        </Dropdown>
      </div>

      {/* Assignee */}
      <div style={{ padding: '0 10px', borderLeft: '1px solid var(--border)', height: '100%', display: 'flex', alignItems: 'center' }}>
        <button ref={personRef} onClick={() => setOpenDD(openDD === 'person' ? null : 'person')}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
          {person ? (
            <>
              <Avatar person={person} size={22} />
              <span className="truncate" style={{ fontSize: 13 }}>{person.name}</span>
            </>
          ) : (
            <span style={{ color: 'var(--fg-subtle)', fontSize: 13 }}>Sin asignar</span>
          )}
        </button>
        <Dropdown open={openDD === 'person'} onClose={() => setOpenDD(null)} anchorRef={personRef} width={220}>
          {PEOPLE.map(p => (
            <button key={p.id} className="dropdown__item"
              onClick={() => { onUpdate({ assignee: p.id }); setOpenDD(null); }}>
              <Avatar person={p} size={22} />
              <span>{p.name}</span>
              {item.assignee === p.id && <I.Check size={13} style={{ marginLeft: 'auto', color: 'var(--primary-mid)' }} />}
            </button>
          ))}
        </Dropdown>
      </div>

      {/* Due */}
      <div style={{
        padding: '0 10px', borderLeft: '1px solid var(--border)', height: '100%',
        display: 'flex', alignItems: 'center', fontSize: 13,
        color: overdue ? 'var(--danger)' : 'var(--fg)',
        fontWeight: overdue ? 500 : 400,
      }}>
        {item.due ? (
          <span className="hstack" style={{ gap: 6 }}>
            {overdue && <I.AlertCircle size={12} />}
            {fmtDate(item.due)}
          </span>
        ) : <span style={{ color: 'var(--fg-subtle)' }}>—</span>}
      </div>

      {/* Priority */}
      <div style={{ padding: '0 8px', borderLeft: '1px solid var(--border)', height: '100%', display: 'flex', alignItems: 'center' }}>
        <div ref={priRef} onClick={() => setOpenDD(openDD === 'priority' ? null : 'priority')} style={{ width: '100%' }}>
          <PriorityPill id={item.priority} />
        </div>
        <Dropdown open={openDD === 'priority'} onClose={() => setOpenDD(null)} anchorRef={priRef} width={140}>
          {PRIORITY_OPTIONS.map(p => (
            <button key={p.id} className="dropdown__item" onClick={() => { onUpdate({ priority: p.id }); setOpenDD(null); }}>
              <PriorityPill id={p.id} />
            </button>
          ))}
        </Dropdown>
      </div>

      {/* Estimate */}
      <div style={{
        padding: '0 10px', borderLeft: '1px solid var(--border)', height: '100%',
        display: 'flex', alignItems: 'center', fontSize: 13, fontFamily: 'var(--font-mono)',
        color: item.estimate ? 'var(--fg)' : 'var(--fg-subtle)',
      }}>
        {item.estimate ? `${item.estimate} pts` : '—'}
      </div>

      {/* Actions */}
      <div style={{ borderLeft: '1px solid var(--border)', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button className="topbar__icon-btn" style={{
          width: 26, height: 26, opacity: hovered ? 1 : 0,
        }}>
          <I.MoreHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { BoardHeader, Toolbar, BoardTable });
