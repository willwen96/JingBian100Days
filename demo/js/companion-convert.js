/**
 * 同伴转化物资 · 前夜事件（物资不足无法开启下一天时触发）
 */

const PARTNER_NAMES = {
  lime: '莱姆',
  blake: '布莱克',
  luna: '露娜',
  evelyn: '伊芙琳',
  john: '约翰',
  baby: '婴儿',
};

export function getEligibleConvertPartners(state, config) {
  const partners = config?.partners ?? {};
  return state.partners.filter((pid) => {
    const rule = partners[pid];
    if (!rule || rule.eligible === false) return false;
    const excludeTags = rule.excludeIfTags ?? [];
    if (excludeTags.some((t) => state.tags.includes(t))) return false;
    return true;
  });
}

export function buildCompanionConvertView(state, config, getPartnerName) {
  const meta = state.event?.meta;
  if (!meta) return null;

  const nameFn = getPartnerName || ((id) => PARTNER_NAMES[id] || id);
  const dayTitle =
    meta.targetDay != null
      ? `惊变第 ${state.day} 天 · 前夜（无法开启第 ${meta.targetDay} 天）`
      : `惊变第 ${state.day} 天 · 前夜`;

  const baseNarrative = config.openingTemplate || meta.openingText;

  if (!meta.selectedPartner) {
    const eligible = meta.eligible || [];
    if (eligible.length === 0) return null;

    const narrative =
      eligible.length === 1
        ? `${baseNarrative}\n\n${config.selectPartnerPrompt || ''} ${nameFn(eligible[0])}。`
        : `${baseNarrative}\n\n${config.selectPartnerPrompt || '（请选择一名同伴）'}`;

    const choices =
      eligible.length === 1
        ? buildResolveChoices(eligible[0], config, nameFn)
        : eligible.map((pid) => ({
            id: `pick_${pid}`,
            text: `看向${nameFn(pid)}`,
            special: true,
            specialLabel: '前夜',
          }));

    return {
      title: config.title || dayTitle,
      narrative,
      choices,
    };
  }

  const pid = meta.selectedPartner;
  return {
    title: config.title || dayTitle,
    narrative: `${baseNarrative}\n\n你盯着${nameFn(pid)}，一个念头在饥饿中变得清晰……`,
    choices: buildResolveChoices(pid, config, nameFn),
  };
}

function buildResolveChoices(partnerId, config, nameFn) {
  const rule = config.partners?.[partnerId];
  const name = nameFn(partnerId);
  const convertText = (config.choices?.convert?.text || '将{partner}转化为物资').replace(
    '{partner}',
    name
  );
  const endureText = config.choices?.endure?.text || '忍着饥饿';

  return [
    { id: `convert_${partnerId}`, text: convertText, special: true, specialLabel: '转化' },
    { id: `endure_${partnerId}`, text: endureText },
  ];
}

export function resolveCompanionConvertChoice(choiceId, state, config) {
  const meta = state.event?.meta;
  if (!meta) return { error: '无效的前夜事件' };

  if (choiceId.startsWith('pick_')) {
    const pid = choiceId.slice(5);
    if (!meta.eligible.includes(pid)) return { error: '无法选择该同伴' };
    meta.selectedPartner = pid;
    return { ok: true, phase: 'selected' };
  }

  let partnerId = meta.selectedPartner;
  if (choiceId.startsWith('convert_')) partnerId = choiceId.slice(8);
  if (choiceId.startsWith('endure_')) partnerId = choiceId.slice(7);

  if (!partnerId || !meta.eligible.includes(partnerId)) {
    return { error: '请先选择同伴' };
  }

  const rule = config.partners?.[partnerId];
  if (!rule) return { error: '未知同伴规则' };

  const isConvert = choiceId.startsWith('convert_');
  const branch = isConvert ? rule.convert : rule.endure;
  if (!branch) return { error: '该选项不可用' };

  return {
    ok: true,
    partnerId,
    isConvert,
    resultText: branch.resultText,
    effects: branch.effects,
    after: branch.after || (isConvert ? 'retryEnterDay' : 'retryDayOrNearDeath'),
    gameOverReason: branch.gameOverReason,
    countsAsConvertChoice: Boolean(branch.countsAsConvertChoice ?? isConvert),
  };
}
