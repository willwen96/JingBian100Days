import { useState } from 'react';

export default function ChoiceLogPanel({ entries, defaultOpen = false, title = '选择记录' }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!entries?.length) return null;

  return (
    <section className="choice-log">
      <button type="button" className="choice-log-toggle" onClick={() => setOpen((v) => !v)}>
        {title}（{entries.length}） {open ? '▾' : '▸'}
      </button>
      {open && (
        <ol className="choice-log-list">
          {entries.map((e) => (
            <li key={e.index} className="choice-log-item">
              <div className="choice-log-head">
                <span className="choice-log-index">#{e.index}</span>
                <span className="choice-log-context">
                  第 {e.day} 天 · {e.context}
                </span>
              </div>
              <div className="choice-log-choice">{e.choiceText}</div>
              {e.resultText ? <div className="choice-log-result">{e.resultText}</div> : null}
              {e.effects?.length ? (
                <div className="choice-log-effects">
                  {e.effects.map((fx, i) => (
                    <span key={i} className="effect-chip small">
                      {fx}
                    </span>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
