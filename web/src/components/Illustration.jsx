import { useEffect, useState } from 'react';

/** 图片路径相对 data/ 目录；部署在子路径时自动加上 BASE_URL */
export function resolveSrc(src) {
  if (/^(https?:)?\/\//.test(src) || src.startsWith('data:')) return src;
  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/$/, '')}/${src.replace(/^\//, '')}`;
}

export default function Illustration({ illustration }) {
  const [failed, setFailed] = useState(false);
  const src = illustration?.src;
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) return null;

  return (
    <figure className="illustration" key={src}>
      <img src={resolveSrc(src)} alt={illustration.alt || ''} loading="lazy" onError={() => setFailed(true)} />
      {illustration.caption ? <figcaption>{illustration.caption}</figcaption> : null}
    </figure>
  );
}
