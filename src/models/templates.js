export const ActionTemplate = {
  name: '',
  overridename: '',
  actionparent: 'None',
  bActive: true,
  bConditionFailOnFirst: true,
  InputType: 'None',
  Conditions: [],
  PassCommands: [],
  FailCommands: [],
  TriggerScene: '',
  TriggerScenes: [],
  CustomChoices: [],
  CustomChoiceTitle: '',
  EnhInputData: null
};

export const ConditionTemplate = {
  conditionname: '',
  Checks: [],
  PassCommands: [],
  FailCommands: []
};

export const CheckTemplate = {
  CondType: 'CT_Variable_Comparison',
  CkType: 'CT_Uninitialized',
  ConditionStep2: '',
  ConditionStep3: 'Equals',
  ConditionStep4: ''
};

export const CommandTemplate = {
  cmdtype: 'CT_DISPLAYTEXT',
  CommandName: '',
  CommandText: '',
  CommandPart2: '',
  CommandPart3: '',
  CommandPart4: '',
  CustomChoices: [],
  EnhInputData: null
};
