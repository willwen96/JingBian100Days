function OutcomeBlock({ label, outcome, variant }) {
  if (!outcome?.text && !outcome?.effects?.length) return null;
  return (
    <div className={`outcome-banner ${variant}`}>
      {label ? <div className="outcome-label">{label}</div> : null}
      {outcome.text ? <div className="outcome-text">{outcome.text}</div> : null}
      {outcome.effects?.length ? (
        <div className="outcome-effects">
          {outcome.effects.map((fx, i) => (
            <span key={i} className="effect-chip">
              {fx}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function OutcomePanels({ choiceOutcome, sceneOutcome }) {
  return (
    <div className="outcome-stack">
      <OutcomeBlock label="上一步选择" outcome={choiceOutcome} variant="choice-outcome" />
      <OutcomeBlock
        label={sceneOutcome?.label || '进入场景'}
        outcome={sceneOutcome}
        variant="scene-outcome"
      />
    </div>
  );
}
