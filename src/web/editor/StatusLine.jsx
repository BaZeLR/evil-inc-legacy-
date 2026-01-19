import React from 'react';

export function StatusLine({ status }) {
  if (!status) return null;
  const kind = status.kind || 'info';
  const label = kind === 'error' ? 'Error' : kind === 'success' ? 'Saved' : 'Info';
  const className = kind === 'error' ? 'drawer-warning' : 'drawer-muted';
  return (
    <div className={className} role={kind === 'error' ? 'alert' : undefined}>
      <b>{label}:</b> {status.message}
    </div>
  );
}

