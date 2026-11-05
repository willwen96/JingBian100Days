import { effectTone, splitCostLog } from '../utils/effectTone.js';

function Chip({ text, tone, prefix }) {
  return (
    <span className={`effect-chip ${tone || effectTone(text)}`}>
      {prefix ? <span className="chip-prefix">{prefix}</span> : null}
      {text}
    </span>
  );
}

function OutcomeBlock({ label, outcome, costChips = [], variant }) {
  const effects = outcome?.effects || [];
  if (!outcome?.text && !effects.length && !costChips.length) return null;
  return (
    <div className={`outcome-banner ${variant}`}>
      {label ? <div className="outcome-label">{label}</div> : null}
      {outcome?.text ? <div className="outcome-text">{outcome.text}</div> : null}
      {costChips.length || effects.length ? (
        <div className="outcome-effects">
          {costChips.map((fx, i) => (
            <Chip key={`c${i}`} text={fx} prefix={/-\d/.test(fx) ? '消耗' : null} />
          ))}
          {effects.map((fx, i) => (
            <Chip key={`e${i}`} text={fx} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DayCostBlock({ entries }) {
  if (!entries?.length) return null;
  return (
    <div className="outcome-banner day-cost-outcome">
      {entries.map((e, i) => (
        <div key={i} className="day-cost-line">
          <span className="day-cost-title">开启第 {e.day} 天</span>
          {e.note ? (
            <Chip text={e.note} tone="gain" />
          ) : e.paid > 0 ? (
            <Chip text={`物资 -${e.paid}`} tone="loss" />
          ) : (
            <Chip text="不消耗物资" tone="neutral" />
          )}
          {e.detail && e.paid > 0 ? <span className="day-cost-detail">（{e.detail}）</span> : null}
        </div>
      ))}
    </div>
  );
}

export default function OutcomePanels({ choiceOutcome, sceneOutcome, costLog, dayCost }) {
  return (
    <div className="outcome-stack">
      <OutcomeBlock
        label="上一步选择"
        outcome={choiceOutcome}
        costChips={splitCostLog(costLog)}
        variant="choice-outcome"
      />
      <DayCostBlock entries={dayCost} />
      <OutcomeBlock
        label={sceneOutcome?.label || '进入场景'}
        outcome={sceneOutcome}
        variant="scene-outcome"
      />
    </div>
  );
}
