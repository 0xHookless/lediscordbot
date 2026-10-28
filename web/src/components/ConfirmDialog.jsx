import { useRef } from 'react';
import { useOverlay } from '../ui.jsx';

export default function ConfirmDialog({ cfg, onClose }) {
  const ref = useRef(null);
  useOverlay(ref, onClose);
  return <>
    <div className="scrim top" onClick={onClose} />
    <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-body" ref={ref}>
      <h2 id="cf-title" className="t-title">{cfg.title}</h2>
      <p id="cf-body" className="t-body muted">{cfg.body}</p>
      <div className="dialog-actions">
        <button className="btn btn-secondary" data-autofocus onClick={onClose}>Cancel</button>
        <button className={`btn ${cfg.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => { onClose(); cfg.onConfirm(); }}>{cfg.cta}</button>
      </div>
    </div>
  </>;
}
