import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('UI crash:', error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div style={{ padding: '2rem', color: '#ffd1d1', fontFamily: 'system-ui, sans-serif', lineHeight: 1.4 }}>
          <h1 style={{ margin: 0, marginBottom: '0.75rem', fontSize: '1.4rem' }}>UI crashed</h1>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error?.stack || error?.message || String(error)}</pre>
        </div>
      );
    }

    return this.props.children;
  }
}

