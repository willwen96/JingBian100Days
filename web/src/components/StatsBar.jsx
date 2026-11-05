import { formatDelta } from '../utils/effectTone.js';

const STATS = [
  { key: 'humanity', label: '人性值' },
  { key: 'supplies', label: '物资' },
  { key: 'ammo', label: '弹药' },
];

export default function StatsBar({ stats, delta, deltaKey }) {
  return (
    <div className="stats-bar">
      {STATS.map(({ key, label }) => {
        const d = delta?.[key] ?? 0;
        const tone = d > 0 ? 'gain' : d < 0 ? 'loss' : '';
        return (
          <div key={tone ? `${key}-${deltaKey}` : key} className={`stat ${key}${tone ? ` changed ${tone}` : ''}`}>
            <div className="label">{label}</div>
            <div className="value-row">
              <span className="value">{stats[key]}</span>
              {d !== 0 ? (
                <span key={deltaKey} className={`stat-delta ${tone}`}>
                  {formatDelta(d)}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
