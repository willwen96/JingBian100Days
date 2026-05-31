import ChoiceList from './ChoiceList.jsx';
import ChoiceLogPanel from './ChoiceLogPanel.jsx';
import ExplorePick from './ExplorePick.jsx';
import MetaPanel from './MetaPanel.jsx';
import OutcomePanels from './OutcomePanels.jsx';
import StatsBar from './StatsBar.jsx';

function DayCostPreview({ preview, engine }) {
  if (!preview?.nextDay) return null;
  const breakdown = engine?.rules?.formatBreakdown(preview.breakdown) ?? '';
  return (
    <div className="day-cost-preview">
      开启第 <strong>{preview.nextDay}</strong> 天预计消耗物资{' '}
      <strong>{preview.total}</strong>
      {breakdown ? <span className="day-cost-detail">（{breakdown}）</span> : null}
    </div>
  );
}

function NearDeathBanner({ onAccept, onDecline }) {
  return (
    <div className="near-death-banner">
      <p>物资不足，是否消耗物资进入濒死状态并跳过消耗？</p>
      <div className="near-death-actions">
        <button type="button" className="btn btn-primary" onClick={onAccept}>
          濒死跳过
        </button>
        <button type="button" className="btn btn-secondary" onClick={onDecline}>
          放弃
        </button>
      </div>
    </div>
  );
}

export default function PlayScreen({
  view,
  engine,
  dayPulse,
  toolbar,
  onPickChoice,
  onPickExplore,
  onNearDeath,
}) {
  const dayLabel = view.day > 0 ? `第 ${view.day} 天` : '爆发前';

  return (
    <>
      {toolbar}
      <header className={`page-header${dayPulse ? ' day-pulse' : ''}`}>
        <h1>惊变100天</h1>
        <p className="subtitle">{dayLabel}</p>
      </header>

      <StatsBar stats={view.stats} />
      <MetaPanel
        shelter={view.shelter}
        partners={view.partners}
        items={view.items}
        tags={view.tags}
      />

      <OutcomePanels choiceOutcome={view.choiceOutcome} sceneOutcome={view.sceneOutcome} />

      {view.lastCostLog ? <div className="cost-banner">{view.lastCostLog}</div> : null}
      <DayCostPreview preview={view.nextDayCostPreview} engine={engine} />

      {view.hostReminder ? (
        <div className="host-reminder">主持人提醒：{view.hostReminder}</div>
      ) : null}
      {view.adrenalineReady ? (
        <div className="host-reminder adrenaline">肾上腺素已就绪：下一次有消耗的选择免费</div>
      ) : null}
      {view.skipDayActions ? <div className="host-reminder">本日无法进行常规行动</div> : null}
      {view.deadlockWarning ? <div className="deadlock-warning">{view.deadlockWarning}</div> : null}

      <section className={`story-panel${dayPulse ? ' day-enter' : ''}`}>
        <div className="phase-title">{view.title}</div>
        <div className="narrative">{view.narrative}</div>
      </section>

      {engine?.state?.pendingNearDeath ? (
        <NearDeathBanner onAccept={() => onNearDeath(true)} onDecline={() => onNearDeath(false)} />
      ) : view.type === 'explore_pick' ? (
        <ExplorePick areas={view.areas} onPick={onPickExplore} />
      ) : (
        <ChoiceList choices={view.choices} onPick={onPickChoice} />
      )}

      <ChoiceLogPanel entries={view.choiceLog} />
    </>
  );
}
