import { useEffect, useState } from 'react';

import { resolveSrc } from './Illustration.jsx';

export function PartnerAvatar({ partner, className = '' }) {
  const [failed, setFailed] = useState(false);
  const src = partner.portrait?.src;
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <span className={`partner-avatar partner-avatar-fallback ${className}`} aria-hidden="true">
        {partner.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      className={`partner-avatar ${className}`}
      src={resolveSrc(src)}
      alt={partner.portrait.alt || partner.name}
      onError={() => setFailed(true)}
    />
  );
}

export function partnerCostText(perDay) {
  return perDay > 0 ? `每天额外消耗 ${perDay} 物资` : '不额外消耗物资';
}

/**
 * 伙伴大图弹窗。autoCloseMs > 0 时自动关闭；点击任意位置关闭。
 * heading：「获得伙伴」或省略（查看伙伴）。
 */
export function PartnerModal({ partner, heading, autoCloseMs = 0, onClose }) {
  useEffect(() => {
    if (!autoCloseMs) return undefined;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [partner?.id, autoCloseMs, onClose]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!partner) return null;
  return (
    <div className="modal-backdrop partner-backdrop" onClick={onClose} role="dialog" aria-label={`伙伴：${partner.name}`}>
      <div className="partner-modal">
        <PartnerAvatar partner={partner} className="partner-modal-portrait" />
        <div className="partner-modal-body">
          {heading ? <div className="partner-modal-heading">{heading}</div> : null}
          <div className="partner-modal-name">{partner.name}</div>
          <div className={`partner-cost${partner.suppliesPerDay > 0 ? ' has-cost' : ''}`}>
            {partnerCostText(partner.suppliesPerDay)}
          </div>
          {partner.intro ? <p className="partner-modal-intro">{partner.intro}</p> : null}
        </div>
        {autoCloseMs ? <div className="partner-modal-timer" style={{ animationDuration: `${autoCloseMs}ms` }} /> : null}
      </div>
    </div>
  );
}

/** 侧栏伙伴列表：宽屏显示头像卡片，窄屏是名字小标签，点开看大图 */
export default function PartnerList({ partners }) {
  const [viewing, setViewing] = useState(null);
  if (!partners?.length) return null;
  return (
    <>
      <div className="partner-list">
        {partners.map((p) => (
          <button key={p.id} type="button" className="partner-item" onClick={() => setViewing(p)} title={`查看${p.name}`}>
            <PartnerAvatar partner={p} />
            <span className="partner-item-text">
              <span className="partner-item-label">伙伴</span>
              <strong>{p.name}</strong>
              <span className="partner-item-cost">{p.suppliesPerDay > 0 ? `-${p.suppliesPerDay} 物资/天` : '不耗物资'}</span>
            </span>
          </button>
        ))}
      </div>
      {viewing ? <PartnerModal partner={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}
