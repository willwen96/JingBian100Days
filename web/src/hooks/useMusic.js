import { useCallback, useEffect, useRef, useState } from 'react';

import { resolveSrc } from '../components/Illustration.jsx';

const STORAGE_KEY = 'jb100_music_muted';
const VOLUME = 0.45;
const FADE_MS = 1200;

function readMuted() {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function normalizeTrack(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return { src: raw, loop: true, next: null };
  if (typeof raw.src !== 'string') return null;
  return { src: raw.src, loop: raw.loop !== false, next: raw.next ?? null };
}

/** 把音量在 ms 毫秒内渐变到 to，结束后调用 done。用定时器而不是 rAF：后台标签页里 rAF 会停，淡出就停不下来 */
function fadeTo(audio, to, ms, done) {
  const from = audio.volume;
  const start = Date.now();
  const id = setInterval(() => {
    const t = Math.min(1, (Date.now() - start) / ms);
    audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
    if (t >= 1) {
      clearInterval(id);
      done?.();
    }
  }, 40);
  return () => clearInterval(id);
}

/**
 * 背景音乐：trackId 变化时交叉淡入淡出；同一首不打断。
 * 浏览器禁止无交互自动播放，被拦下时等用户第一次点击再播。
 */
export function useMusic(trackId, tracks) {
  const [muted, setMuted] = useState(readMuted);
  const current = useRef({ id: null, audio: null, cancelFade: null });
  const [playingId, setPlayingId] = useState(null);
  const pendingUnlock = useRef(false);

  const desiredId = muted ? null : trackId;

  useEffect(() => {
    // 不循环的曲目（胜利）播完后接 next，这期间 desired 保持不变，所以用 playingId 跟踪实际在放的
    setPlayingId(desiredId);
  }, [desiredId]);

  useEffect(() => {
    const cur = current.current;
    if (cur.id === playingId) return;

    // 旧曲目：停掉它的淡入，淡出后释放（淡出不随本次 effect 取消，保证一定会停）
    if (cur.audio) {
      const old = cur.audio;
      cur.cancelFade?.();
      fadeTo(old, 0, FADE_MS, () => {
        old.pause();
        old.removeAttribute('src');
        old.load();
      });
    }

    const track = normalizeTrack(playingId ? tracks?.[playingId] : null);
    if (!track) {
      current.current = { id: playingId, audio: null, cancelFade: null };
      return;
    }

    const audio = new Audio(resolveSrc(track.src));
    audio.loop = track.loop;
    audio.preload = 'auto';
    audio.volume = 0;
    if (!track.loop && track.next) {
      audio.addEventListener('ended', () => setPlayingId(track.next), { once: true });
    }
    const entry = { id: playingId, audio, cancelFade: null };
    current.current = entry;

    const fadeIn = () => {
      if (current.current !== entry) return;
      entry.cancelFade = fadeTo(audio, VOLUME, FADE_MS);
    };

    audio
      .play()
      .then(fadeIn)
      .catch(() => {
        // 自动播放被拦截：等用户第一次交互再播当前曲目
        if (pendingUnlock.current) return;
        pendingUnlock.current = true;
        const unlock = () => {
          pendingUnlock.current = false;
          window.removeEventListener('pointerdown', unlock);
          window.removeEventListener('keydown', unlock);
          const live = current.current;
          if (!live.audio || !live.audio.paused) return;
          live.audio
            .play()
            .then(() => {
              if (current.current === live) live.cancelFade = fadeTo(live.audio, VOLUME, FADE_MS);
            })
            .catch(() => {});
        };
        window.addEventListener('pointerdown', unlock);
        window.addEventListener('keydown', unlock);
      });
  }, [playingId, tracks]);

  // 卸载时停掉
  useEffect(
    () => () => {
      current.current.audio?.pause();
    },
    []
  );

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* 无痕模式等情况下忽略 */
      }
      return next;
    });
  }, []);

  return { muted, toggleMuted };
}
