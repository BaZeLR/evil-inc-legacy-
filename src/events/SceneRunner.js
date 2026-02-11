import { chancePercent, cryptoRng, randomIntInclusive } from '../utils/random.js';
import { interpolateText } from './valueResolver.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeVariableRef(raw) {
  const ref = String(raw ?? '').trim();
  if (!ref) return '';
  if (ref.includes('.')) return ref;

  if (ref === 'Credits') return 'player.Credits';
  if (ref === 'Inventory' || ref === 'Equipped' || ref === 'CompletedScenes' || ref === 'VisitedRooms') return `player.${ref}`;
  return `player.Stats.${ref}`;
}

function resolveAbilityNames(player) {
  const abilities = asArray(player?.Abilities);
  return new Set(abilities.map(a => String(a?.Name ?? a?.name ?? '').trim()).filter(Boolean));
}

function resolveStatValue(player, key) {
  const name = String(key ?? '').trim();
  if (!name) return undefined;
  if (name === 'Credits') return player?.Credits;
  return player?.Stats?.[name];
}

function splitParagraphs(raw, ctx) {
  if (Array.isArray(raw)) {
    return raw
      .map(entry => interpolateText(String(entry ?? ''), ctx))
      .map(entry => String(entry ?? '').trim())
      .filter(Boolean);
  }
  const text = interpolateText(String(raw ?? ''), ctx);
  if (!text.trim()) return [];
  return text
    .split(/\r?\n\s*\r?\n/)
    .map(block => block.trim())
    .filter(Boolean);
}

function buildParagraphChunks(paragraphs, perPage) {
  const size = Number.isFinite(perPage) && perPage > 0 ? perPage : 2;
  const pages = [];
  for (let i = 0; i < paragraphs.length; i += size) {
    pages.push(paragraphs.slice(i, i + size).join('\n\n'));
  }
  return pages;
}

function checkStatRequirements(player, requirements) {
  const req = requirements && typeof requirements === 'object' ? requirements : null;
  if (!req) return true;

  for (const [key, rawExpected] of Object.entries(req)) {
    const actual = resolveStatValue(player, key);
    const expected = rawExpected;

    if (typeof expected === 'number') {
      if (!(Number(actual) >= expected)) return false;
      continue;
    }

    if (typeof expected === 'boolean') {
      if (Boolean(actual) !== expected) return false;
      continue;
    }

    if (String(actual ?? '').toLowerCase() !== String(expected ?? '').toLowerCase()) return false;
  }

  return true;
}

function normalizeShowIf(showIf) {
  if (!showIf) return null;
  if (typeof showIf !== 'object') return null;
  return showIf;
}

function parseSceneRef(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { sceneId: '', stageId: '' };

  const separatorIndex = raw.indexOf('::');
  if (separatorIndex > 0) {
    return { sceneId: raw.slice(0, separatorIndex).trim(), stageId: raw.slice(separatorIndex + 2).trim() };
  }

  const hashIndex = raw.indexOf('#');
  if (hashIndex > 0) {
    return { sceneId: raw.slice(0, hashIndex).trim(), stageId: raw.slice(hashIndex + 1).trim() };
  }

  return { sceneId: raw, stageId: '' };
}

export class SceneRunner {
  constructor(game) {
    this.game = game;
    this.active = null;
  }

  isActive() {
    return Boolean(this.active?.sceneId);
  }

  getActiveScene() {
    if (!this.active?.sceneId) return null;
    return this.game?.sceneLoader?.getScene?.(this.active.sceneId) ?? null;
  }

  getStage(stageId) {
    const scene = this.getActiveScene();
    if (!scene) return null;
    const stages = asArray(scene?.Stages);
    return stages.find(s => String(s?.StageID ?? '').trim() === String(stageId ?? '').trim()) || null;
  }

  begin(sceneId) {
    const parsed = parseSceneRef(sceneId);
    const scene = this.game?.sceneLoader?.getScene?.(parsed.sceneId) ?? null;
    if (!scene) return null;

    const repeatable = Boolean(scene?.Repeatable ?? scene?.repeatable ?? false);
    if (!repeatable && this.game?.sceneLoader?.isSceneCompleted?.(scene.UniqueID)) return null;

    const requiredFlags = scene?.Trigger?.RequiredFlags ?? scene?.RequiredFlags ?? null;
    if (requiredFlags && !checkStatRequirements(this.game?.player, requiredFlags)) return null;

    const startIf = scene?.StartIf ?? scene?.startIf ?? scene?.Trigger?.StartIf ?? scene?.Trigger?.startIf ?? null;
    if (startIf && !this.evaluateShowIf(startIf)) return null;

    const stages = asArray(scene?.Stages);
    const requestedStage = parsed.stageId
      ? stages.find(s => String(s?.StageID ?? '').trim() === String(parsed.stageId ?? '').trim()) || null
      : null;
    const first = requestedStage || stages[0] || null;
    const firstStageId = String(first?.StageID ?? '').trim();
    if (!firstStageId) return null;

    this.active = { sceneId: scene.UniqueID, stageId: firstStageId, chunkStageId: firstStageId, chunkIndex: 0 };
    this.game.spawnState.pendingScene = { sceneId: scene.UniqueID, scene, category: 'story', stageId: firstStageId };

    return this.buildResultForCurrentStage({ enteredFromChoice: false, extraTexts: [] });
  }

  endScene() {
    const sceneId = this.active?.sceneId;
    this.active = null;
    if (this.game?.spawnState) this.game.spawnState.pendingScene = null;

    if (sceneId) {
      this.game?.sceneLoader?.completeScene?.(sceneId);
      this.applyRewards(sceneId);
      this.game?.eventController?.completeThreadEventForScene?.(sceneId);
    }
  }

  applyRewards(sceneId) {
    const scene = this.game?.sceneLoader?.getScene?.(sceneId) ?? null;
    const rewards = scene?.Rewards?.OnComplete ?? null;
    if (!rewards || !this.game?.player) return;

    if (Number(rewards.Experience ?? 0) > 0) {
      this.game.gainExperience?.(Number(rewards.Experience));
    }

    if (Number(rewards.Credits ?? 0) !== 0) {
      const current = Number(this.game.player.Credits ?? 0);
      this.game.player.Credits = current + Number(rewards.Credits);
    }

    const flags = rewards.Flags && typeof rewards.Flags === 'object' ? rewards.Flags : null;
    if (flags) {
      for (const [flag, value] of Object.entries(flags)) {
        if (!this.game.player.Stats) this.game.player.Stats = {};
        this.game.player.Stats[flag] = value;
      }
    }

    const items = asArray(rewards.Items);
    if (items.length) {
      if (!Array.isArray(this.game.player.Inventory)) this.game.player.Inventory = [];
      for (const itemId of items) {
        const id = String(itemId ?? '').trim();
        if (!id) continue;
        if (this.game.player.Inventory.some(entry => String(entry?.UniqueID ?? entry?.id ?? '').trim() === id)) continue;
        const obj = this.game?.objectMap?.[id] ?? null;
        this.game.player.Inventory.push({ UniqueID: id, Name: obj?.Name || obj?.name || id });
      }
    }
  }

  evaluateShowIf(showIf) {
    const player = this.game?.player;
    const show = normalizeShowIf(showIf);
    if (!show) return true;

    if (show.StatCheck) {
      if (!checkStatRequirements(player, show.StatCheck)) return false;
    }

    if (show.AbilityCheck) {
      const abilities = resolveAbilityNames(player);
      const needed = String(show.AbilityCheck ?? '').trim();
      if (needed && !abilities.has(needed)) return false;
    }

    if (show.Condition) {
      const condType = String(show.Condition ?? '').trim();
      const variable = normalizeVariableRef(show.Variable);
      const op = show.Operator;
      const value = show.Value;

      const check = { CondType: condType, Step2: variable, Step3: op, Step4: value };
      const ctx = { game: this.game, player: this.game.player, room: this.game.getCurrentRoom?.() ?? null };
      const dummyResult = { errors: [], texts: [] };
      return Boolean(this.game?.eventEngine?.evaluateCheck?.(check, ctx, dummyResult));
    }

    return true;
  }

  normalizeEffect(effect) {
    if (!effect || typeof effect !== 'object') return null;
    if (typeof effect.cmdtype === 'string') return effect;
    if (typeof effect.Type === 'string') return { ...effect, cmdtype: effect.Type };
    return null;
  }

  runEffects(effects, result) {
    const list = asArray(effects).map(e => this.normalizeEffect(e)).filter(Boolean);
    if (!list.length) return;

    const ctx = {
      game: this.game,
      player: this.game.player,
      room: this.game.getCurrentRoom?.() ?? null,
      preserveFirstMedia: true
    };

    for (const node of list) {
      this.game?.eventEngine?.executeCommand?.(node, ctx, result);
    }
  }

  getChunkingConfig(scene, stage, ctx) {
    const enabled = Boolean(stage?.ChunkByParagraphs ?? scene?.ChunkByParagraphs ?? false);
    if (!enabled) return { enabled: false, pages: [] };
    const perPage = Number(stage?.ParagraphsPerPage ?? scene?.ParagraphsPerPage ?? 2);
    const paragraphSource = stage?.Text ?? stage?.TextLines ?? stage?.Paragraphs ?? '';
    const paragraphs = splitParagraphs(paragraphSource, ctx);
    const pages = buildParagraphChunks(paragraphs, perPage);
    return { enabled: true, pages };
  }

  ensureChunkState(stageId) {
    if (!this.active) return;
    if (this.active.chunkStageId !== stageId) {
      this.active.chunkStageId = stageId;
      this.active.chunkIndex = 0;
    }
  }

  buildResultForCurrentStage({ enteredFromChoice, extraTexts, suppressEffects = false, _skipDuplicateGuard = 0 } = {}) {
    const scene = this.getActiveScene();
    const stage = this.getStage(this.active?.stageId);

    const result = this.game?.eventEngine?.createResult?.() ?? { texts: [], errors: [], paused: false };
    const ctx = {
      game: this.game,
      player: this.game?.player ?? null,
      room: this.game?.getCurrentRoom?.() ?? null
    };

    if (!scene || !stage) {
      result.texts.push('Scene error: missing stage.');
      result.paused = false;
      return result;
    }

    this.ensureChunkState(String(stage?.StageID ?? '').trim());
    const chunkConfig = this.getChunkingConfig(scene, stage, ctx);
    const chunkPages = chunkConfig.pages || [];
    const chunkIndexRaw = Number(this.active?.chunkIndex ?? 0);
    const chunkIndex = chunkPages.length ? Math.min(Math.max(chunkIndexRaw, 0), chunkPages.length - 1) : 0;
    const hasMoreChunks = chunkPages.length ? chunkIndex < chunkPages.length - 1 : false;

    // Apply stage effects on entry (only once per stage).
    const startingRoomId = String(ctx.room?.id ?? ctx.room?.UniqueID ?? '').trim();
    if (!suppressEffects && (!chunkPages.length || chunkIndex === 0)) {
      this.runEffects(stage.Effects, result);
    }
    const currentRoom = this.game?.getCurrentRoom?.() ?? ctx.room ?? null;
    const currentRoomId = String(currentRoom?.id ?? currentRoom?.UniqueID ?? '').trim();
    const roomChanged = Boolean(startingRoomId && currentRoomId && startingRoomId !== currentRoomId);
    if (roomChanged) {
      ctx.room = currentRoom;
    }

    const textSource = stage?.Text ?? stage?.TextLines ?? stage?.Paragraphs ?? '';
    const stageTextRaw = Array.isArray(textSource)
      ? textSource
          .map(entry => interpolateText(String(entry ?? ''), ctx))
          .map(entry => String(entry ?? '').trim())
          .filter(Boolean)
          .join('\n\n')
      : interpolateText(String(textSource ?? ''), ctx).trim();
    const stageText = chunkPages.length ? chunkPages[chunkIndex] : stageTextRaw;
    const combinedTexts = [...asArray(extraTexts), ...(stageText ? [stageText] : []), ...asArray(result.texts)];

    const media = interpolateText(String(stage.Media ?? scene.Media ?? ''), ctx).trim();
    const roomMedia = roomChanged
      ? interpolateText(String(currentRoom?.Picture ?? currentRoom?.media ?? ''), ctx).trim()
      : '';

    const stageChoices = asArray(stage.Choices)
      .filter(choice => this.evaluateShowIf(choice?.ShowIf))
      .map(choice => ({
        id: String(choice?.ChoiceID ?? '').trim(),
        text: interpolateText(String(choice?.DisplayText ?? choice?.Text ?? ''), ctx).trim(),
        tooltip: interpolateText(String(choice?.Tooltip ?? ''), ctx).trim() || null,
        kind: choice?.ShowIf && typeof choice.ShowIf === 'object' && String(choice.ShowIf.AbilityCheck ?? '').trim() ? 'ability' : 'choice',
        raw: choice
      }))
      .filter(entry => entry.id && entry.text);

    const nextStage = String(stage.NextStage ?? '').trim();
    const isEnd = Boolean(stage.IsEnd);
    const nextStageId = hasMoreChunks ? String(stage.StageID ?? '').trim() || '__chunk__' : nextStage || null;

    if (!hasMoreChunks && nextStage && !stageChoices.length && _skipDuplicateGuard < 1) {
      const nextStageObj = this.getStage(nextStage);
      if (nextStageObj) {
        const nextTextSource = nextStageObj?.Text ?? nextStageObj?.TextLines ?? nextStageObj?.Paragraphs ?? '';
        const nextTextRaw = Array.isArray(nextTextSource)
          ? nextTextSource
              .map(entry => interpolateText(String(entry ?? ''), ctx))
              .map(entry => String(entry ?? '').trim())
              .filter(Boolean)
              .join('\n\n')
          : interpolateText(String(nextTextSource ?? ''), ctx).trim();

        const stageIntro = stageTextRaw.split('\n').map(line => line.trim()).find(Boolean) || '';
        const nextIntro = nextTextRaw.split('\n').map(line => line.trim()).find(Boolean) || '';
        const duplicateIntro =
          stageIntro &&
          nextIntro &&
          stageIntro.toLowerCase() === nextIntro.toLowerCase();

        if (duplicateIntro) {
          this.active.stageId = nextStage;
          this.active.chunkStageId = nextStage;
          this.active.chunkIndex = 0;
          return this.buildResultForCurrentStage({
            enteredFromChoice,
            extraTexts: asArray(result.texts),
            suppressEffects: true,
            _skipDuplicateGuard: _skipDuplicateGuard + 1
          });
        }
      }
    }

    result.texts = combinedTexts.filter(Boolean);
    const finalMedia = roomChanged && roomMedia ? roomMedia : (result.media || media || null);
    result.media = finalMedia;

    const rawAutoAdvance =
      stage?.AutoAdvanceDelayMs ??
      stage?.AutoAdvanceMs ??
      scene?.AutoAdvanceDelayMs ??
      scene?.AutoAdvanceMs ??
      null;
    const autoAdvanceMs = Number(rawAutoAdvance);

    // Auto-advance stages that explicitly request it.
    const autoAdvance = Boolean(stage.AutoAdvance);

    result.paused = true;
    result.sceneData = {
      sceneId: scene.UniqueID,
      stageId: String(stage.StageID ?? '').trim(),
      title: scene.Title || scene.SceneName || scene.UniqueID,
      media: finalMedia || null,
      nextStageId,
      autoAdvanceMs: Number.isFinite(autoAdvanceMs) && autoAdvanceMs > 0 ? autoAdvanceMs : null,
      lines: result.texts,
      choices: stageChoices.map(c => ({ id: c.id, text: c.text, tooltip: c.tooltip, kind: c.kind })),
      suppressText: Boolean(stage.SuppressText ?? scene.SuppressText ?? false)
    };

    if (!hasMoreChunks && (isEnd || (!stageChoices.length && !nextStage))) {
      this.endScene();
      if (result.sceneData) result.sceneData.isEnd = true;
      return result;
    }

    if (autoAdvance && nextStage && !hasMoreChunks) {
      this.active.stageId = nextStage;
      this.active.chunkStageId = nextStage;
      this.active.chunkIndex = 0;
      return this.buildResultForCurrentStage({ enteredFromChoice: false, extraTexts: result.texts });
    }

    return result;
  }

  advance() {
    const scene = this.getActiveScene();
    const stage = this.getStage(this.active?.stageId);
    if (!scene || !stage) return null;

    this.ensureChunkState(String(stage?.StageID ?? '').trim());
    const chunkConfig = this.getChunkingConfig(scene, stage);
    const chunkPages = chunkConfig.pages || [];
    const chunkIndex = Number(this.active?.chunkIndex ?? 0);
    if (chunkPages.length && chunkIndex < chunkPages.length - 1) {
      this.active.chunkIndex = chunkIndex + 1;
      return this.buildResultForCurrentStage({ enteredFromChoice: false, extraTexts: [], suppressEffects: true });
    }

    const nextStage = String(stage.NextStage ?? '').trim();
    if (!nextStage) {
      this.endScene();
      return {
        ...(this.game?.eventEngine?.createResult?.() ?? { texts: [], errors: [], paused: false }),
        paused: false,
        sceneData: null
      };
    }

    this.active.stageId = nextStage;
    this.active.chunkStageId = nextStage;
    this.active.chunkIndex = 0;
    return this.buildResultForCurrentStage({ enteredFromChoice: false, extraTexts: [] });
  }

  choose(choiceId, { rng = cryptoRng } = {}) {
    const stage = this.getStage(this.active?.stageId);
    const scene = this.getActiveScene();
    if (!stage || !scene) return null;

    const rawChoice = asArray(stage.Choices).find(c => String(c?.ChoiceID ?? '').trim() === String(choiceId ?? '').trim()) || null;
    if (!rawChoice) return null;

    const result = this.game?.eventEngine?.createResult?.() ?? { texts: [], errors: [], paused: false };
    const ctx = {
      game: this.game,
      player: this.game?.player ?? null,
      room: this.game?.getCurrentRoom?.() ?? null
    };

    // Costs and rewards on the choice itself.
    const energyCost = Number(rawChoice.EnergyCost ?? 0);
    if (energyCost > 0 && this.game?.player?.Stats) {
      const current = Number(this.game.player.Stats.Energy ?? 0);
      this.game.player.Stats.Energy = Math.max(0, current - energyCost);
    }

    const gainExp = Number(rawChoice.GainExp ?? 0);
    if (gainExp > 0) this.game.gainExperience?.(gainExp);

    // Effects.
    this.runEffects(rawChoice.Effects, result);

    // Resolve branching.
    let nextStage = String(rawChoice.NextStage ?? '').trim();
    const chance = Number(rawChoice.ChanceSuccess ?? 0);

    const extraTexts = [];

    if (Number.isFinite(chance) && chance > 0) {
      const success = chancePercent(chance, rng);
      const branch = success ? rawChoice.OnSuccess : rawChoice.OnFailure;

      if (typeof branch === 'string') {
        nextStage = String(branch).trim();
      } else if (branch && typeof branch === 'object') {
        if (branch.Text) extraTexts.push(interpolateText(String(branch.Text), ctx));
        if (branch.NextStage) nextStage = String(branch.NextStage).trim();
        if (Number(branch.GainExp ?? 0) > 0) this.game.gainExperience?.(Number(branch.GainExp));
      }
    }

    if (!nextStage) {
      // If no next stage, treat as end.
      this.endScene();
      return {
        ...result,
        texts: [...extraTexts, ...asArray(result.texts)],
        paused: false,
        sceneData: null
      };
    }

    this.active.stageId = nextStage;
    this.active.chunkStageId = nextStage;
    this.active.chunkIndex = 0;

    // Include any immediate branch text before the stage text.
    return this.buildResultForCurrentStage({ enteredFromChoice: true, extraTexts: [...extraTexts, ...asArray(result.texts)] });
  }
}
