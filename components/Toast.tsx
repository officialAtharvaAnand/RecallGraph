export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
      <button aria-label="Dismiss message" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
