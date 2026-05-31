export default function ExplorePick({ areas, onPick }) {
  return (
    <div className="choices explore-pick">
      <p className="explore-prompt">今天你想去哪里？</p>
      {areas.map((a) => (
        <button key={a.id} type="button" className="choice-btn" onClick={() => onPick(a.id)}>
          前往：{a.name}
        </button>
      ))}
    </div>
  );
}
