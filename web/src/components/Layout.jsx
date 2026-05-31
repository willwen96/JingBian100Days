import { useState } from 'react';

export default function AppShell({ children, toolbar }) {
  return (
    <div className="app">
      {toolbar}
      {children}
    </div>
  );
}

export function LoadingScreen({ message = '加载中…' }) {
  return (
    <div className="app loading-screen">
      <p>{message}</p>
    </div>
  );
}

export function ErrorScreen({ message }) {
  return (
    <div className="app error-screen">
      <h2>无法加载游戏</h2>
      <p>{message}</p>
      <p className="hint">请在项目根目录运行 <code>npm run dev:web</code></p>
    </div>
  );
}

export function Toast({ message, onDone }) {
  if (!message) return null;
  return (
    <div className="toast" onAnimationEnd={onDone}>
      {message}
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState(null);
  const show = (text) => setMsg(text);
  const clear = () => setMsg(null);
  return { msg, show, clear };
}
