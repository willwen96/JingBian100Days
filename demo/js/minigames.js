/**
 * 黎明者营地小游戏
 */

export function playDiceGame(state, bet) {
  const rolls = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6));
  const win = new Set(rolls).size === 4;
  const rollStr = rolls.join('、');

  if (win) {
    const bonus = Math.floor(bet / 2);
    state.stats.supplies += bet + bonus;
    return {
      win: true,
      text: `你押注 ${bet} 物资，连续掷出 ${rollStr}。四点皆不相同！庄家认输，返还押注并另奖 ${bonus} 物资。`,
    };
  }

  return {
    win: false,
    text: `你押注 ${bet} 物资，连续掷出 ${rollStr}。出现重复点数——押注全部没收。`,
  };
}

/** 左轮赌命：掷 1–6，点数为 4 则死亡 */
export function playRussianRoulette(state) {
  const roll = 1 + Math.floor(Math.random() * 6);

  if (roll === 4) {
    return {
      survived: false,
      roll,
      text: `咔——下一声是闷响。左轮停在 ${roll}，击发。你倒下了，这一局无法濒死跳过。`,
      gameOver: true,
      grantTag: '我不是主角',
    };
  }

  state.stats.supplies += 100;
  return {
    survived: true,
    roll,
    text: `你扣下扳机，是空膛（${roll}）。对手脸色发白。营地按规矩付给你 100 物资——「运气」的奖赏。`,
  };
}
