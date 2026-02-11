import { create } from 'zustand';

function resolveNext(valueOrUpdater, current) {
  return typeof valueOrUpdater === 'function' ? valueOrUpdater(current) : valueOrUpdater;
}

export const useGameStore = create(set => ({
  game: null,
  setGame: value => set({ game: value }),

  currentRoom: null,
  setCurrentRoom: value => set({ currentRoom: value }),

  roomObjects: [],
  setRoomObjects: value => set({ roomObjects: value }),

  roomNpcs: [],
  setRoomNpcs: value => set({ roomNpcs: value }),

  player: null,
  setPlayer: value => set({ player: value }),

  error: null,
  setError: value => set({ error: value }),

  eventMessages: [],
  setEventMessages: valueOrUpdater => set(state => ({ eventMessages: resolveNext(valueOrUpdater, state.eventMessages) })),

  eventMedia: null,
  setEventMedia: valueOrUpdater => set(state => ({ eventMedia: resolveNext(valueOrUpdater, state.eventMedia) })),

  levelUpNotice: null,
  setLevelUpNotice: valueOrUpdater => set(state => ({ levelUpNotice: resolveNext(valueOrUpdater, state.levelUpNotice) })),

  combat: null,
  setCombat: valueOrUpdater => set(state => ({ combat: resolveNext(valueOrUpdater, state.combat) })),

  combatMenuEntered: false,
  setCombatMenuEntered: valueOrUpdater => set(state => ({ combatMenuEntered: resolveNext(valueOrUpdater, state.combatMenuEntered) })),

  hoveredObjectMenuId: null,
  setHoveredObjectMenuId: valueOrUpdater =>
    set(state => ({ hoveredObjectMenuId: resolveNext(valueOrUpdater, state.hoveredObjectMenuId) })),

  hoveredNpcMenuId: null,
  setHoveredNpcMenuId: valueOrUpdater =>
    set(state => ({ hoveredNpcMenuId: resolveNext(valueOrUpdater, state.hoveredNpcMenuId) })),

  hoveredContainerItemId: null,
  setHoveredContainerItemId: valueOrUpdater =>
    set(state => ({ hoveredContainerItemId: resolveNext(valueOrUpdater, state.hoveredContainerItemId) })),

  containerUi: {},
  setContainerUi: valueOrUpdater => set(state => ({ containerUi: resolveNext(valueOrUpdater, state.containerUi) })),

  activeDrawer: null, // 'player' | 'inventory' | 'navigation' | 'combat' | 'settings' | 'vendor' | 'actions' | 'editor' | null
  setActiveDrawer: valueOrUpdater => set(state => ({ activeDrawer: resolveNext(valueOrUpdater, state.activeDrawer) })),

  shopVendorId: null,
  setShopVendorId: valueOrUpdater => set(state => ({ shopVendorId: resolveNext(valueOrUpdater, state.shopVendorId) })),

  shopCategory: null,
  setShopCategory: valueOrUpdater => set(state => ({ shopCategory: resolveNext(valueOrUpdater, state.shopCategory) })),

  shopHoveredItemId: null,
  setShopHoveredItemId: valueOrUpdater =>
    set(state => ({ shopHoveredItemId: resolveNext(valueOrUpdater, state.shopHoveredItemId) })),

  shopPurchaseNotice: null,
  setShopPurchaseNotice: valueOrUpdater =>
    set(state => ({ shopPurchaseNotice: resolveNext(valueOrUpdater, state.shopPurchaseNotice) })),

  selectedInventoryId: null,
  setSelectedInventoryId: valueOrUpdater => set(state => ({ selectedInventoryId: resolveNext(valueOrUpdater, state.selectedInventoryId) })),

  equippedInventory: {},
  setEquippedInventory: valueOrUpdater => set(state => ({ equippedInventory: resolveNext(valueOrUpdater, state.equippedInventory) })),

  inspectTarget: { type: 'room', id: null }, // 'room' | 'object' | 'npc'
  setInspectTarget: valueOrUpdater => set(state => ({ inspectTarget: resolveNext(valueOrUpdater, state.inspectTarget) }))
}));
