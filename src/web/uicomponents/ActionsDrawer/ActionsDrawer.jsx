import React from 'react';
import './ActionsDrawer.css';

function normalizeSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .map(section => {
      const title = String(section?.title ?? '').trim();
      const items = Array.isArray(section?.items) ? section.items.filter(Boolean) : [];
      if (!title && !items.length) return null;
      return { title, items };
    })
    .filter(Boolean);
}

export function ActionsDrawer({ title, description, sections }) {
  const resolvedTitle = String(title ?? '').trim();
  const resolvedDesc = String(description ?? '').trim();
  const resolvedSections = normalizeSections(sections);

  return (
    <div className="drawer-body actions-drawer">
      {resolvedTitle ? <div className="drawer-subtitle">{resolvedTitle}</div> : null}
      {resolvedDesc ? <div className="drawer-muted">{resolvedDesc}</div> : null}

      {resolvedSections.length ? (
        resolvedSections.map((section, idx) => (
          <div key={`${section.title || 'section'}:${idx}`} className="actions-section">
            {section.title ? <div className="actions-section-title">{section.title}</div> : null}
            <div className="actions-grid" role="group" aria-label={section.title || 'Actions'}>
              {section.items.map(item => (
                <button
                  key={item.id || item.label}
                  type="button"
                  className="actions-btn"
                  disabled={Boolean(item.disabled)}
                  title={item.tooltip || item.description || item.label}
                  onClick={item.onClick}
                >
                  <span className="actions-btn-label">{item.label}</span>
                  {item.description ? <span className="actions-btn-desc">{item.description}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="drawer-muted">No actions available.</div>
      )}
    </div>
  );
}

