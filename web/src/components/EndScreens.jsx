import ChoiceLogPanel from './ChoiceLogPanel.jsx';
import EndingScorePanel from './EndingScorePanel.jsx';

export function GameOverScreen({ view, onRestart }) {
  return (
    <div className="screen-end">
      <h2>游戏结束</h2>
      {view.choiceOutcome?.text && view.choiceOutcome.text !== view.reason ? (
        <div className="outcome-banner choice-outcome">
          <div className="outcome-text">{view.choiceOutcome.text}</div>
        </div>
      ) : null}
      <p className="end-reason">{view.reason}</p>
      <EndingScorePanel endingScore={view.endingScore} tagsById={view.tagsById} />
      <ChoiceLogPanel entries={view.choiceLog} defaultOpen title="本局选择回顾" />
      <button type="button" className="btn btn-primary btn-block" onClick={onRestart}>
        重新开始
      </button>
    </div>
  );
}

export function DemoCompleteScreen({ view, onRestart }) {
  const s = view.state;
  const shelterNames = { villa: '山中别墅', bunker: '城郊防空洞' };

  return (
    <div className="screen-end">
      <h2>结局结算</h2>
      {view.finaleNarrative ? (
        <section className="story-panel finale-story">
          <div className="phase-title">{view.finaleTitle || '大结局'}</div>
          <div className="narrative">{view.finaleNarrative}</div>
        </section>
      ) : null}
      <p className="finale-stats">
        人性 {s.stats.humanity} · 物资 {s.stats.supplies} · 弹药 {s.stats.ammo} · 庇护所：
        {shelterNames[s.shelter] || '—'}
      </p>
      <EndingScorePanel endingScore={view.endingScore} tagsById={view.tags} />
      <ChoiceLogPanel entries={view.choiceLog} defaultOpen title="本局选择回顾" />
      <button type="button" className="btn btn-primary btn-block" onClick={onRestart}>
        再玩一次
      </button>
    </div>
  );
}
