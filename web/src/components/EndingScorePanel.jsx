import { formatScoreBreakdownLines } from '@engine/scoring.js';

function formatTagScore(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

export default function EndingScorePanel({ endingScore, tagsById }) {
  if (!endingScore) {
    return <p className="score-missing">（未计算结局分数）</p>;
  }

  const formulaLines = formatScoreBreakdownLines(endingScore);
  const additiveTags = endingScore.additiveTags || [];

  return (
    <section className="score-panel">
      <p className="score-headline">
        结局分数 <strong className="score-total">{endingScore.totalScore}</strong>
        <span className="score-grade">{endingScore.grade?.rank}</span>
        <span className="score-grade-label">{endingScore.grade?.label}</span>
      </p>
      <ol className="score-formula">
        {formulaLines.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ol>
      <ul className="tag-list tag-list-scored">
        {additiveTags.map((t) => {
          const isFinale = t.id === endingScore.finaleTag?.id;
          const flavor = !isFinale ? tagsById?.[t.id]?.flavorText : null;
          return (
            <li key={t.id} className={isFinale ? 'tag-finale' : ''}>
              <span className="tag-name">{t.name}</span>
              <span className={`tag-score${t.score < 0 ? ' tag-score-negative' : ''}`}>
                {formatTagScore(t.score)}
              </span>
              {flavor ? <p className="tag-flavor">{flavor}</p> : null}
            </li>
          );
        })}
        {endingScore.finaleTag ? (
          <li className="tag-finale">
            <span className="tag-name">{endingScore.finaleTag.name}</span>
            <span className="tag-score">×{endingScore.finaleMultiplier}</span>
            <span className="tag-role">大结局乘数</span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
