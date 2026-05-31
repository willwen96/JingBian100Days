import { formatSaveSlotTime } from '@engine/save.js';

export default function SaveModal({ mode, slots, onSelect, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{mode === 'save' ? '存档' : '读档'}</h3>
        <div className="save-slots">
          {slots.map((slot) => (
            <button
              key={slot.slot}
              type="button"
              className="save-slot"
              disabled={mode === 'load' && slot.empty}
              onClick={() => onSelect(slot.slot)}
            >
              <span className="slot-num">槽位 {slot.slot + 1}</span>
              {slot.empty ? (
                <span className="slot-empty">空</span>
              ) : (
                <>
                  <span className="slot-summary">
                    {slot.summary?.dayLabel} · {slot.summary?.shelterName}
                  </span>
                  <span className="slot-meta">
                    {slot.summary?.partnersLabel} · {formatSaveSlotTime(slot.savedAt)}
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-secondary btn-block" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  );
}
