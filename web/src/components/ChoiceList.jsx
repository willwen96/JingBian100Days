import { useState } from 'react';

function NumberChoice({ choice, onPick }) {
  const [value, setValue] = useState(String(choice.input.defaultValue ?? choice.input.min));

  return (
    <div className={`choice-card${choice.disabled ? ' disabled' : ''}`}>
      <div className="choice-text">{choice.text}</div>
      {choice.hint ? <div className="choice-hint">{choice.hint}</div> : null}
      <div className="choice-input-row">
        <label>
          {choice.input.label}
          <input
            type="number"
            min={choice.input.min}
            max={choice.input.max}
            step={choice.input.step}
            value={value}
            disabled={choice.disabled}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !choice.disabled) onPick(choice.id, value);
            }}
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={choice.disabled}
          onClick={() => onPick(choice.id, value)}
        >
          {choice.input.submitText}
        </button>
      </div>
    </div>
  );
}

function TextChoice({ choice, onPick }) {
  return (
    <button
      type="button"
      className={`choice-btn${choice.special ? ' choice-special' : ''}`}
      disabled={choice.disabled}
      onClick={() => onPick(choice.id)}
    >
      <span className="choice-label-row">
        <span className="choice-text">{choice.text}</span>
        {choice.special && choice.specialLabel ? (
          <span className="special-tag">{choice.specialLabel}</span>
        ) : null}
      </span>
      {choice.hint ? <span className="choice-hint">{choice.hint}</span> : null}
    </button>
  );
}

export default function ChoiceList({ choices, onPick }) {
  if (!choices?.length) {
    return <p className="empty-hint">（暂无选项）</p>;
  }

  return (
    <div className="choices">
      {choices.map((c) =>
        c.input?.type === 'number' ? (
          <NumberChoice key={c.id} choice={c} onPick={onPick} />
        ) : (
          <TextChoice key={c.id} choice={c} onPick={onPick} />
        )
      )}
    </div>
  );
}
