import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('React error:', error, info);
  }

  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div style={{
          background: '#1a1a1a',
          color: '#f5f5f5',
          fontFamily: 'ui-monospace, monospace',
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          boxSizing: 'border-box',
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(201, 100, 66, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '20px',
              fontSize: '24px',
            }}>
              ⚠️
            </div>
            <h1 style={{
              fontSize: '18px',
              fontWeight: 600,
              margin: '0 0 8px 0',
            }}>
              Something went wrong
            </h1>
            <p style={{
              fontSize: '13px',
              color: '#a3a3a3',
              margin: '0 0 20px 0',
              lineHeight: '1.5',
            }}>
              The app encountered a runtime error. Try clearing localStorage and reloading.
            </p>
            <div style={{
              background: '#242424',
              border: '1px solid #353535',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '20px',
              overflow: 'auto',
              maxHeight: '300px',
            }}>
              <p style={{
                fontSize: '12px',
                color: '#c96442',
                margin: '0 0 8px 0',
                fontWeight: 500,
              }}>
                {err.name || 'Error'}
              </p>
              <p style={{
                fontSize: '12px',
                color: '#a3a3a3',
                margin: '0',
                lineHeight: '1.5',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {err.message || String(err)}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                style={{
                  background: '#c96442',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Clear localStorage & Reload
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: '#2a2a2a',
                  color: '#a3a3a3',
                  border: '1px solid #353535',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
