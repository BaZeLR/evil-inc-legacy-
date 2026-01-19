import { useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGameStore } from '../store/gameStore.js';

function normalizePathname(pathname) {
  const raw = String(pathname ?? '').trim();
  if (!raw) return '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function parseSegments(pathname) {
  const path = normalizePathname(pathname);
  return path
    .split('/')
    .map(seg => seg.trim())
    .filter(Boolean);
}

const DRAWER_SEGMENTS = new Map([
  ['player', 'player'],
  ['inventory', 'inventory'],
  ['settings', 'settings'],
  ['editor', 'editor'],
  ['navigation', 'navigation'],
  ['vendor', 'vendor'],
  ['combat', 'combat'],
  ['actions', 'actions']
]);

function resolveDrawerFromSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return null;
  const key = String(segments[0] ?? '').toLowerCase();
  return DRAWER_SEGMENTS.get(key) ?? null;
}

function resolvePathFromDrawer(activeDrawer) {
  const drawer = String(activeDrawer ?? '').trim();
  if (!drawer) return '/';
  return `/${drawer}`;
}

export function RouteSync() {
  const location = useLocation();
  const navigate = useNavigate();
  const lastProcessedPathRef = useRef(null);
  const pendingNavigateRef = useRef(null);

  const activeDrawer = useGameStore(state => state.activeDrawer);
  const setActiveDrawer = useGameStore(state => state.setActiveDrawer);
  const combat = useGameStore(state => state.combat);
  const setSelectedInventoryId = useGameStore(state => state.setSelectedInventoryId);
  const setShopVendorId = useGameStore(state => state.setShopVendorId);

  const pathname = normalizePathname(location.pathname);
  const segments = useMemo(() => parseSegments(pathname), [pathname]);
  const routeDrawer = resolveDrawerFromSegments(segments);
  const routeDrawerId = segments.length > 1 ? String(segments[1] ?? '').trim() : '';

  useEffect(() => {
    if (lastProcessedPathRef.current === pathname) return;
    lastProcessedPathRef.current = pathname;
    pendingNavigateRef.current = null;

    if (routeDrawer === 'combat' && !combat) {
      if (pathname !== '/') navigate('/', { replace: true });
      return;
    }

    if (routeDrawer === 'actions' && combat) {
      if (pathname !== '/combat') navigate('/combat', { replace: true });
      return;
    }

    if (routeDrawer === 'navigation' && combat) {
      if (pathname !== '/') navigate('/', { replace: true });
      return;
    }

    if (routeDrawer === 'editor' && combat) {
      if (pathname !== '/') navigate('/', { replace: true });
      return;
    }

    if (routeDrawer !== activeDrawer) setActiveDrawer(routeDrawer);

    if (routeDrawer === 'inventory' && routeDrawerId) setSelectedInventoryId(routeDrawerId);
    if (routeDrawer === 'vendor' && routeDrawerId) setShopVendorId(routeDrawerId);

    if (!routeDrawer && segments.length) {
      navigate('/', { replace: true });
    }
  }, [
    activeDrawer,
    combat,
    navigate,
    pathname,
    segments,
    routeDrawer,
    routeDrawerId,
    setActiveDrawer,
    setSelectedInventoryId,
    setShopVendorId
  ]);

  useEffect(() => {
    const desired = resolvePathFromDrawer(activeDrawer);
    if (desired === '/') {
      if (pathname !== '/' && pathname !== '') {
        if (pendingNavigateRef.current === '/') return;
        pendingNavigateRef.current = '/';
        navigate('/', { replace: true });
      } else {
        pendingNavigateRef.current = null;
      }
      return;
    }

    if (pathname === desired || pathname.startsWith(`${desired}/`)) {
      pendingNavigateRef.current = null;
      return;
    }

    if (pendingNavigateRef.current === desired) return;
    pendingNavigateRef.current = desired;
    navigate(desired, { replace: true });
  }, [activeDrawer, navigate, pathname]);

  return null;
}
