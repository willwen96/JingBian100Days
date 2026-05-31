export default function StatsBar({ stats }) {
  return (
    <div className="stats-bar">
      <div className="stat humanity">
        <div className="label">人性值</div>
        <div className="value">{stats.humanity}</div>
      </div>
      <div className="stat supplies">
        <div className="label">物资</div>
        <div className="value">{stats.supplies}</div>
      </div>
      <div className="stat ammo">
        <div className="label">弹药</div>
        <div className="value">{stats.ammo}</div>
      </div>
    </div>
  );
}
