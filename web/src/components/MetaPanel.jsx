import { useState } from 'react';

import PartnerList from './PartnerCard.jsx';

export default function MetaPanel({ shelter, partners, items, tags }) {
  // partners: engine 的 partnerDetails（含头像、每日消耗）
  const [open, setOpen] = useState(false);
  const tagCount = tags?.length ?? 0;

  return (
    <div className="meta-panel">
      <div className="meta-primary">
        <span className="chip">庇护所 <strong>{shelter}</strong></span>
        {items?.map((i) => (
          <span key={i} className="chip">
            {i}
          </span>
        ))}
      </div>
      <PartnerList partners={partners} />
      {tagCount > 0 && (
        <div className="tags-section">
          <button type="button" className="tags-toggle" onClick={() => setOpen((v) => !v)}>
            词条 {tagCount} 个 {open ? '▾' : '▸'}
          </button>
          {open && (
            <div className="tags-grid">
              {tags.map((t) => (
                <span key={t} className="tag-chip">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
