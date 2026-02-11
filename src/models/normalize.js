import { ActionTemplate, ConditionTemplate, CheckTemplate, CommandTemplate } from './templates.js';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneTemplate(template, overrides = {}) {
  return { ...template, ...overrides };
}

function normalizeCustomChoices(raw) {
  return asArray(raw);
}

function normalizeTriggerScenes(action) {
  return asArray(action?.TriggerScenes ?? action?.triggerScenes ?? action?.TriggerSceneSequence ?? action?.triggerSceneSequence);
}

export function normalizeAction(rawAction) {
  if (!isRecord(rawAction)) return null;

  const base = cloneTemplate(ActionTemplate, {
    Conditions: [],
    PassCommands: [],
    FailCommands: [],
    TriggerScenes: [],
    CustomChoices: [],
    EnhInputData: null
  });

  if (typeof rawAction.run === 'string' && !Array.isArray(rawAction.PassCommands)) {
    return {
      ...base,
      name: rawAction.name ?? 'Unnamed Action',
      overridename: rawAction.overridename ?? '',
      bActive: rawAction.bActive !== false,
      bConditionFailOnFirst: true,
      InputType: rawAction.InputType ?? 'None',
      Tooltip: rawAction.Tooltip ?? '',
      Conditions: [],
      PassCommands: [
        cloneTemplate(CommandTemplate, {
          cmdtype: 'CT_DISPLAYTEXT',
          CommandText: rawAction.run
        })
      ],
      FailCommands: [],
      TriggerScene: rawAction.TriggerScene ?? rawAction.triggerScene ?? null,
      TriggerScenes: normalizeTriggerScenes(rawAction),
      CustomChoices: normalizeCustomChoices(rawAction.CustomChoices),
      CustomChoiceTitle: rawAction.CustomChoiceTitle ?? '',
      EnhInputData: rawAction.EnhInputData ?? null
    };
  }

  return {
    ...base,
    name: rawAction.name ?? 'Unnamed Action',
    overridename: rawAction.overridename ?? '',
    actionparent: rawAction.actionparent ?? base.actionparent,
    bActive: rawAction.bActive !== false,
    bConditionFailOnFirst: rawAction.bConditionFailOnFirst !== false,
    InputType: rawAction.InputType ?? 'None',
    Tooltip: rawAction.Tooltip ?? '',
    Conditions: asArray(rawAction.Conditions),
    PassCommands: asArray(rawAction.PassCommands),
    FailCommands: asArray(rawAction.FailCommands),
    TriggerScene: rawAction.TriggerScene ?? rawAction.triggerScene ?? null,
    TriggerScenes: normalizeTriggerScenes(rawAction),
    CustomChoices: normalizeCustomChoices(rawAction.CustomChoices),
    CustomChoiceTitle: rawAction.CustomChoiceTitle ?? '',
    EnhInputData: rawAction.EnhInputData ?? null
  };
}

export function normalizeCondition(rawCondition) {
  if (!isRecord(rawCondition)) return null;
  const base = cloneTemplate(ConditionTemplate, { Checks: [], PassCommands: [], FailCommands: [] });
  return {
    ...base,
    conditionname: rawCondition.conditionname ?? rawCondition.ConditionName ?? base.conditionname,
    Checks: asArray(rawCondition.Checks),
    PassCommands: asArray(rawCondition.PassCommands),
    FailCommands: asArray(rawCondition.FailCommands)
  };
}

export function normalizeCheck(rawCheck) {
  if (!isRecord(rawCheck)) return null;
  const base = cloneTemplate(CheckTemplate);
  return {
    ...base,
    CondType: rawCheck.CondType ?? rawCheck.Condition ?? base.CondType,
    CkType: rawCheck.CkType ?? rawCheck.ckType ?? base.CkType,
    ConditionStep2: rawCheck.ConditionStep2 ?? rawCheck.Step2 ?? base.ConditionStep2,
    ConditionStep3: rawCheck.ConditionStep3 ?? rawCheck.Step3 ?? base.ConditionStep3,
    ConditionStep4: rawCheck.ConditionStep4 ?? rawCheck.Step4 ?? base.ConditionStep4
  };
}

export function normalizeCommand(rawCommand) {
  if (!isRecord(rawCommand)) return null;
  const base = cloneTemplate(CommandTemplate, { CustomChoices: [], EnhInputData: null });
  return {
    ...base,
    cmdtype: rawCommand.cmdtype ?? rawCommand.Type ?? base.cmdtype,
    CommandName: rawCommand.CommandName ?? rawCommand.name ?? base.CommandName,
    CommandText: rawCommand.CommandText ?? rawCommand.text ?? rawCommand.run ?? base.CommandText,
    CommandPart2: rawCommand.CommandPart2 ?? rawCommand.part2 ?? rawCommand.Variable ?? rawCommand.VarName ?? base.CommandPart2,
    CommandPart3: rawCommand.CommandPart3 ?? rawCommand.part3 ?? rawCommand.Operator ?? base.CommandPart3,
    CommandPart4: rawCommand.CommandPart4 ?? rawCommand.part4 ?? rawCommand.Value ?? base.CommandPart4,
    CustomChoices: asArray(rawCommand.CustomChoices ?? rawCommand.customChoices),
    EnhInputData: rawCommand.EnhInputData ?? rawCommand.enhInputData ?? base.EnhInputData
  };
}
