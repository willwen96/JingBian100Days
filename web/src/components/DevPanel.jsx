import { useMemo, useState } from 'react';

function Section({ title, children }) {
  return (
    <section className="dev-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function StatInput({ label, value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? String(value);
  const commit = () => {
    if (draft != null && draft !== String(value)) onCommit(draft);
    setDraft(null);
  };
  return (
    <label className="dev-stat">
      <span>{label}</span>
      <input
        type="number"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

function ToggleChips({ options, selected, onToggle }) {
  return (
    <div className="dev-chips">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`dev-chip${selected.includes(o.id) ? ' on' : ''}`}
          onClick={() => onToggle(o.id)}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

export default function DevPanel({ engine, run, onClose, show }) {
  const catalog = useMemo(() => engine.devCatalog(), [engine]);
  const s = engine.state;
  const [day, setDay] = useState(String(catalog.days[0]?.day ?? 1));
  const [eventId, setEventId] = useState(catalog.events[0]?.id ?? '');
  const [nodeId, setNodeId] = useState('');
  const [flagName, setFlagName] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [itemName, setItemName] = useState('');
  const [json, setJson] = useState('');

  const act = (fn, okMsg) => {
    const r = run(fn);
    if (r?.error) show(r.error);
    else if (okMsg) show(okMsg);
    return r;
  };

  const nodes = catalog.events.find((e) => e.id === eventId)?.nodes ?? [];
  const activeFlags = Object.keys(s.flags || {}).filter((k) => s.flags[k]);
  const tagOptions = catalog.tags.filter(
    (t) => !tagFilter || t.name.includes(tagFilter) || t.id.includes(tagFilter)
  );
  const itemOptions = [...new Set([...catalog.items, ...s.items])].map((i) => ({ id: i, name: i }));

  const where =
    s.mode === 'event'
      ? `事件 ${s.event?.id} / ${s.event?.nodeId}`
      : s.mode === 'explore'
        ? `探索 ${s.explore?.areaId}${s.explore?.nodeId ? ` / ${s.explore.nodeId}` : ''}`
        : s.mode === 'pre'
          ? `爆发前 ${s.prePhase}`
          : s.mode;

  return (
    <aside className="dev-panel" role="dialog" aria-label="开发者模式">
      <header className="dev-header">
        <strong>开发者模式</strong>
        <button type="button" className="btn btn-secondary btn-toolbar" onClick={onClose}>
          收起
        </button>
      </header>
      <p className="dev-where">
        第 {s.day} 天 · {where}
        {s.route ? ` · 路线 ${s.route}` : ''}
      </p>

      <Section title="数值">
        <div className="dev-stats">
          <StatInput label="人性" value={s.stats.humanity} onCommit={(v) => act((e) => e.devSetStat('humanity', v))} />
          <StatInput label="物资" value={s.stats.supplies} onCommit={(v) => act((e) => e.devSetStat('supplies', v))} />
          <StatInput label="弹药" value={s.stats.ammo} onCommit={(v) => act((e) => e.devSetStat('ammo', v))} />
        </div>
      </Section>

      <Section title="跳转">
        <div className="dev-row">
          <select value={day} onChange={(e) => setDay(e.target.value)}>
            {catalog.days.map((d) => (
              <option key={d.day} value={d.day}>
                第 {d.day} 天 · {d.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => act((e) => e.devJumpToDay(day), `已跳到第 ${day} 天`)}>
            跳到这天
          </button>
        </div>
        <div className="dev-row">
          <select
            value={eventId}
            onChange={(e) => {
              setEventId(e.target.value);
              setNodeId('');
            }}
          >
            {catalog.events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}（{ev.id}）
              </option>
            ))}
          </select>
          <select value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            <option value="">起始节点</option>
            {nodes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => act((e) => e.devEnterEvent(eventId, nodeId || undefined), '已进入事件')}>
            进入事件
          </button>
        </div>
        <p className="dev-hint">跳天不扣物资，但会触发当天的开场效果。</p>
      </Section>

      <Section title="庇护所 / 路线">
        <div className="dev-row">
          <select value={s.shelter || ''} onChange={(e) => act((en) => en.devSetShelter(e.target.value))}>
            <option value="">无</option>
            {catalog.shelters.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select value={s.route || ''} onChange={(e) => act((en) => en.devSetRoute(e.target.value))}>
            <option value="">未选结局线</option>
            {catalog.routes.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
      </Section>

      <Section title="伙伴">
        <ToggleChips options={catalog.partners} selected={s.partners} onToggle={(id) => act((e) => e.devToggle('partners', id))} />
      </Section>

      <Section title="物品">
        <ToggleChips options={itemOptions} selected={s.items} onToggle={(id) => act((e) => e.devToggle('items', id))} />
        <div className="dev-row">
          <input placeholder="其他物品名" value={itemName} onChange={(e) => setItemName(e.target.value)} />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!itemName.trim()}
            onClick={() => {
              act((e) => e.devToggle('items', itemName.trim(), true));
              setItemName('');
            }}
          >
            添加
          </button>
        </div>
      </Section>

      <Section title={`词条（已有 ${s.tags.length} 个）`}>
        <input className="dev-filter" placeholder="筛选词条" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} />
        <ToggleChips options={tagOptions} selected={s.tags} onToggle={(id) => act((e) => e.devToggle('tags', id))} />
      </Section>

      <Section title="剧情 flag">
        <ToggleChips
          options={[...new Set([...catalog.flags, ...activeFlags])].map((f) => ({ id: f, name: f }))}
          selected={activeFlags}
          onToggle={(f) => act((e) => e.devSetFlag(f, !s.flags[f]))}
        />
        <div className="dev-row">
          <input placeholder="新 flag 名" value={flagName} onChange={(e) => setFlagName(e.target.value)} />
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!flagName.trim()}
            onClick={() => {
              act((e) => e.devSetFlag(flagName.trim(), true));
              setFlagName('');
            }}
          >
            设置
          </button>
        </div>
      </Section>

      <Section title="修复">
        <div className="dev-row wrap">
          <button type="button" className="btn btn-secondary" onClick={() => act((e) => e.devClearPending(), '已清除濒死/重伤状态')}>
            清除濒死 / 重伤
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => act((e) => e.devResetDayRestart(), '已恢复重新开启当天')}>
            恢复「重新开启当天」
          </button>
        </div>
      </Section>

      <Section title="导出 / 导入状态">
        <div className="dev-row wrap">
          <button type="button" className="btn btn-secondary" onClick={() => setJson(engine.devExportState())}>
            导出到下框
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!json.trim()}
            onClick={() => act((e) => e.devImportState(json), '已导入状态')}
          >
            从下框导入
          </button>
        </div>
        <textarea
          className="dev-json"
          rows={6}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder="导出的状态 JSON 会显示在这里，也可以粘贴后导入"
        />
      </Section>

      <p className="dev-hint">网址加 ?dev=0 或按 Ctrl+Shift+D 可关闭开发者模式。修改过的存档会在结算页标注。</p>
    </aside>
  );
}
