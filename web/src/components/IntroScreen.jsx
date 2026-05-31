export default function IntroScreen({ view, onStart, onContinue }) {
  return (
    <>
      <header className="page-header">
        <h1>惊变100天</h1>
        <p className="subtitle">网页版</p>
      </header>
      <section className="story-panel intro-panel">
        {view.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        <p className="host-line">{view.hostOpening}</p>
      </section>
      {view.hasSavedGame && (
        <button type="button" className="btn btn-secondary btn-block" onClick={onContinue}>
          继续游戏
        </button>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={onStart}>
        开始游戏
      </button>
    </>
  );
}
