// Shared helpers
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const cx = (...xs) => xs.filter(Boolean).join(' ');
const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  const month = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()];
  return `${d.getDate()} ${month}`;
};
const isOverdue = (iso) => {
  if (!iso) return false;
  const d = new Date(iso + 'T23:59:59');
  return d < new Date();
};

const getPerson = (id) => window.PEOPLE.find(p => p.id === id);
const getStatus = (id) => window.STATUS_OPTIONS.find(s => s.id === id);
const getPriority = (id) => window.PRIORITY_OPTIONS.find(p => p.id === id);

// Avatar
function Avatar({ person, size = 24, showBorder = false }) {
  const style = {
    width: size, height: size, background: person.color,
    fontSize: size <= 24 ? 10 : size <= 32 ? 12 : 14,
    border: showBorder ? '2px solid var(--bg)' : undefined,
  };
  return <span className="avatar" style={style}>{person.initials}</span>;
}

function AvatarStack({ ids, max = 4, size = 24 }) {
  const list = ids.slice(0, max);
  const extra = ids.length - max;
  return (
    <div className="avatar-stack">
      {list.map(id => {
        const p = getPerson(id);
        return p ? <Avatar key={id} person={p} size={size} showBorder /> : null;
      })}
      {extra > 0 && (
        <span className="avatar" style={{
          width: size, height: size, fontSize: 10,
          background: 'var(--surface-2)', color: 'var(--fg-muted)',
          border: '2px solid var(--bg)',
        }}>+{extra}</span>
      )}
    </div>
  );
}

// Status pill
function StatusPill({ id, onClick, style: extra }) {
  const s = getStatus(id);
  if (!s) return null;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const bg = isDark ? s.dark_bg : s.bg;
  const fg = isDark ? s.dark_fg : s.fg;
  return (
    <span className="status-pill" onClick={onClick}
      style={{ background: bg, color: fg, cursor: onClick ? 'pointer' : 'default', ...extra }}>
      {s.label}
    </span>
  );
}

function PriorityPill({ id }) {
  const p = getPriority(id);
  if (!p) return null;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return (
    <span className="status-pill" style={{
      background: isDark ? p.dark_bg : p.bg,
      color: isDark ? p.dark_fg : p.fg,
      minWidth: 70,
    }}>{p.label}</span>
  );
}

// Dropdown - renders relative to a ref
function Dropdown({ open, onClose, anchorRef, children, align = 'left', width }) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({
      top: r.bottom + 4,
      left: align === 'right' ? r.right - (width || 200) : r.left,
    });
  }, [open, align, width, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (anchorRef.current && anchorRef.current.contains(e.target)) return;
      onClose();
    };
    setTimeout(() => document.addEventListener('mousedown', h), 0);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose, anchorRef]);

  if (!open) return null;
  return ReactDOM.createPortal(
    <div className="dropdown" style={{ top: pos.top, left: pos.left, width }}>
      {children}
    </div>,
    document.body
  );
}

// Toast system via window event
function Toasts() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const h = (e) => {
      const id = Math.random().toString(36).slice(2);
      setToasts(prev => [...prev, { id, ...e.detail }]);
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
    };
    window.addEventListener('toast', h);
    return () => window.removeEventListener('toast', h);
  }, []);
  return (
    <div className="toast-wrap">
      {toasts.map(t => (
        <div key={t.id} className="toast">
          <I.Check size={14} /> {t.text}
        </div>
      ))}
    </div>
  );
}
const toast = (text) => window.dispatchEvent(new CustomEvent('toast', { detail: { text } }));

Object.assign(window, {
  cx, fmtDate, isOverdue, getPerson, getStatus, getPriority,
  Avatar, AvatarStack, StatusPill, PriorityPill, Dropdown, Toasts, toast,
});
