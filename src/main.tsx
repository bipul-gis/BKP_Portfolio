import {Component, type ErrorInfo, type ReactNode, StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

class AppErrorBoundary extends Component<any, any> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '0 auto' }}>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#52525b', marginBottom: '1rem' }}>
            The portfolio failed to load. Try a hard refresh (Ctrl+Shift+R). If it persists, check the browser console.
          </p>
          <pre style={{ background: '#f4f4f5', padding: '1rem', borderRadius: 8, overflow: 'auto', fontSize: 12 }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
