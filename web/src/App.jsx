import { useCallback, useState } from 'react';

import DevPanel from './components/DevPanel.jsx';
import { DemoCompleteScreen, GameOverScreen } from './components/EndScreens.jsx';
import IntroScreen from './components/IntroScreen.jsx';
import AppShell, { ErrorScreen, LoadingScreen, Toast, useToast } from './components/Layout.jsx';
import { PartnerModal } from './components/PartnerCard.jsx';
import PlayScreen from './components/PlayScreen.jsx';
import SaveModal from './components/SaveModal.jsx';
import { useDevMode } from './hooks/useDevMode.js';
import { useGame } from './hooks/useGame.js';

export default function App() {
  const {
    engine,
    view,
    loadError,
    dayPulse,
    statDelta,
    newPartners,
    dismissNewPartner,
    clearNewPartners,
    run,
    refresh,
    saveSlots,
    hasSavedGame,
  } = useGame();
  const { msg, show, clear } = useToast();
  const [saveModal, setSaveModal] = useState(null);
  const [devEnabled] = useDevMode();
  const [devOpen, setDevOpen] = useState(false);

  const handleRestart = useCallback(() => {
    clearNewPartners();
    run((e) => e.restart());
  }, [run, clearNewPartners]);

  const handleStart = useCallback(() => {
    run((e) => e.startGame());
  }, [run]);

  const handlePickChoice = useCallback(
    (id, value) => {
      const result = run(
        (e) => (value != null ? e.pickChoiceWithInput(id, value) : e.pickChoice(id)),
        { trackDelta: true }
      );
      if (result?.error) {
        show(result.error);
        return;
      }
      if (result?.nearDeath) {
        show('物资不足，请选择濒死跳过或放弃');
        return;
      }
      const v = engine?.getView();
      const fx = [...(v?.choiceOutcome?.effects || []), ...(v?.sceneOutcome?.effects || [])];
      if (fx.length) show(fx.join(' · '));
    },
    [run, engine, show]
  );

  const handlePickExplore = useCallback(
    (areaId) => {
      const result = run((e) => e.pickExploreArea(areaId), { trackDelta: true });
      if (result?.error) show(result.error);
    },
    [run, show]
  );

  const handleNearDeath = useCallback(
    (accept) => {
      run((e) => e.resolveNearDeath(accept), { trackDelta: true });
    },
    [run]
  );

  const toolbar = view && view.type !== 'intro' && (
    <div className="game-toolbar">
      <button type="button" className="btn btn-secondary btn-toolbar" onClick={() => setSaveModal('save')}>
        存档
      </button>
      <button type="button" className="btn btn-secondary btn-toolbar" onClick={() => setSaveModal('load')}>
        读档
      </button>
      {view.canRestartDay ? (
        <button
          type="button"
          className="btn btn-secondary btn-toolbar"
          onClick={() => {
            const r = run((e) => e.restartCurrentDay());
            if (r?.error) show(r.error);
          }}
        >
          重新开启当天
        </button>
      ) : view.dayRestartUsed ? (
        <button type="button" className="btn btn-secondary btn-toolbar" disabled title="本天已使用过">
          重新开启当天
        </button>
      ) : null}
    </div>
  );

  if (loadError) {
    return <ErrorScreen message={loadError} />;
  }
  if (!engine || !view) {
    return <LoadingScreen />;
  }

  return (
    <AppShell wide={view.type === 'play' || view.type === 'explore_pick'} intro={view.type === 'intro'}>
      {view.type === 'intro' && (
        <IntroScreen
          view={{ ...view, hasSavedGame }}
          onStart={handleStart}
          onContinue={() => setSaveModal('load')}
        />
      )}

      {(view.type === 'play' || view.type === 'explore_pick') && (
        <PlayScreen
          view={view}
          engine={engine}
          dayPulse={dayPulse}
          statDelta={statDelta}
          toolbar={toolbar}
          onPickChoice={handlePickChoice}
          onPickExplore={handlePickExplore}
          onNearDeath={handleNearDeath}
        />
      )}

      {view.type === 'gameover' && <GameOverScreen view={view} onRestart={handleRestart} />}

      {view.type === 'demo_complete' && <DemoCompleteScreen view={view} onRestart={handleRestart} />}

      {saveModal && (
        <SaveModal
          mode={saveModal}
          slots={saveSlots}
          onClose={() => setSaveModal(null)}
          onSelect={(slot) => {
            const r =
              saveModal === 'save'
                ? run((e) => e.saveGame(slot))
                : run((e) => e.loadGame(slot));
            if (r?.error) show(r.error);
            else if (saveModal === 'save') show(`已存档至槽位 ${slot + 1}`);
            else show('读档成功');
            setSaveModal(null);
          }}
        />
      )}

      {devEnabled && !devOpen ? (
        <button type="button" className="dev-fab" onClick={() => setDevOpen(true)} title="开发者模式">
          DEV
        </button>
      ) : null}
      {devEnabled && devOpen ? (
        <DevPanel engine={engine} run={run} show={show} onClose={() => setDevOpen(false)} />
      ) : null}

      {newPartners.length && engine ? (
        <PartnerModal
          partner={engine.getPartnerInfo(newPartners[0])}
          heading="获得伙伴"
          autoCloseMs={3000}
          onClose={dismissNewPartner}
        />
      ) : null}

      <Toast message={msg} onDone={clear} />
    </AppShell>
  );
}
