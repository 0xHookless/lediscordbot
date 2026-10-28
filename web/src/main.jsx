import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

/** Shows what broke instead of a blank page, so the error can be reported. */
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('Staff Console crashed:', error, info.componentStack); }
  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="center-screen"><div className="signin" role="alert">
        <h1 className="t-title">Something broke in the console</h1>
        <p className="t-body muted">Nothing was lost. Reload to continue, and send this error to whoever maintains the console:</p>
        <pre className="md-pre" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(error?.stack || error).split('\n').slice(0, 4).join('\n')}</pre>
        <button className="btn btn-primary" style={{ justifySelf: 'start' }} onClick={() => location.reload()}>Reload</button>
      </div></div>
    );
  }
}

createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
