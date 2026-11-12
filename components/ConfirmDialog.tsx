export function ConfirmDialog({
  title,
  message,
  action,
  busy,
  reason,
  onReason,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  action: string;
  busy: boolean;
  reason?: string;
  onReason?: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="overlay" role="presentation">
      <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <h2 id="confirm-title">{title}</h2>
        <p>{message}</p>
        {onReason && (
          <label>
            Reason
            <textarea
              minLength={3}
              required
              value={reason ?? ''}
              onChange={(e) => onReason(e.target.value)}
            />
          </label>
        )}
        <div className="dialog-actions">
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className={action === 'Delete' ? 'danger-button' : ''}
            disabled={busy || Boolean(onReason && (reason ?? '').trim().length < 3)}
            onClick={onConfirm}
          >
            {busy ? 'Working…' : action}
          </button>
        </div>
      </section>
    </div>
  );
}
