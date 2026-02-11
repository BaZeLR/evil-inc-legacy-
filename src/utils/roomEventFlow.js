export function buildTravelEvents({ leaveEvents, characterLeaveEvents, plannedCharacterLeave, timerEvents, plannedEnter, plannedPresence, plannedCharacterEnter, enterEvents, characterEvents } = {}) {
  const plannedTexts = [
    ...(Array.isArray(plannedEnter?.texts) ? plannedEnter.texts : []),
    ...(Array.isArray(plannedPresence?.texts) ? plannedPresence.texts : []),
    ...(Array.isArray(plannedCharacterEnter?.texts) ? plannedCharacterEnter.texts : [])
  ];

  return {
    texts: [
      ...(leaveEvents?.texts || []),
      ...(characterLeaveEvents?.texts || []),
      ...(plannedCharacterLeave?.texts || []),
      ...(timerEvents?.texts || []),
      ...plannedTexts,
      ...(enterEvents?.texts || []),
      ...(characterEvents?.texts || [])
    ],
    media:
      plannedCharacterEnter?.media ||
      characterEvents?.media ||
      enterEvents?.media ||
      plannedPresence?.media ||
      plannedEnter?.media ||
      timerEvents?.media ||
      plannedCharacterLeave?.media ||
      characterLeaveEvents?.media ||
      leaveEvents?.media ||
      null,
    sceneData:
      plannedCharacterEnter?.sceneData ||
      characterEvents?.sceneData ||
      enterEvents?.sceneData ||
      plannedPresence?.sceneData ||
      plannedEnter?.sceneData ||
      timerEvents?.sceneData ||
      plannedCharacterLeave?.sceneData ||
      characterLeaveEvents?.sceneData ||
      leaveEvents?.sceneData ||
      null,
    paused: Boolean(
      leaveEvents?.paused ||
        characterLeaveEvents?.paused ||
        plannedCharacterLeave?.paused ||
        timerEvents?.paused ||
        plannedEnter?.paused ||
        plannedPresence?.paused ||
        plannedCharacterEnter?.paused ||
        enterEvents?.paused ||
        characterEvents?.paused
    ),
    errors: [
      ...(leaveEvents?.errors || []),
      ...(characterLeaveEvents?.errors || []),
      ...(plannedCharacterLeave?.errors || []),
      ...(timerEvents?.errors || []),
      ...(plannedEnter?.errors || []),
      ...(plannedPresence?.errors || []),
      ...(plannedCharacterEnter?.errors || []),
      ...(enterEvents?.errors || []),
      ...(characterEvents?.errors || [])
    ]
  };
}
