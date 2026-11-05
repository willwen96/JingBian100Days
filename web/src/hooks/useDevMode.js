import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = '100days:devMode';

function readInitial() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('dev')) {
      const on = params.get('dev') !== '0';
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
      return on;
    }
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 开发者模式开关：网址加 ?dev=1 开启、?dev=0 关闭，或按 Ctrl+Shift+D 切换。
 * 开关状态记在本机浏览器里。
 */
export function useDevMode() {
  const [enabled, setEnabled] = useState(readInitial);

  const set = useCallback((on) => {
    setEnabled(on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* 存不了就只在本次会话生效 */
    }
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setEnabled((prev) => {
          const next = !prev;
          try {
            localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
          } catch {
            /* ignore */
          }
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return [enabled, set];
}
