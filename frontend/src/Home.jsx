import React, { useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from "react";
import SelectionPopup from "./components/SelectionPopup";
import LegalMenu from "./components/LegalMenu";
import ProfileManagerModal from "./components/ProfileManagerModal";
import DeveloperConsole from "./components/DeveloperConsole";
import { fetchProfile } from "./api/profile";
import { legalDocuments } from "./legal/legalDocs";
import { usePresenceStats } from "./hooks/usePresenceStats";
import { usePresenceSync } from "./hooks/usePresenceSync";
import { fetchPurchases, createPurchase } from "./api/purchases";
import "./components/PurchasedArea.css";

const DEFAULT_TRANSFORM = { x: 0, y: 0, width: 1, height: 1 };
const PRICE_PER_PIXEL = 0.02;
const PROFILE_STORAGE_KEY = "buyYourPixels.profile";

const loadStoredProfile = () => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.token && parsed?.profile) return parsed;
  } catch {
    window.localStorage.removeItem(PROFILE_STORAGE_KEY);
  }
  return null;
};

const rectArea = (rect) => (rect?.w ?? 0) * (rect?.h ?? 0);

const normalizeTiles = (area) => {
  if (!area) return [];
  if (Array.isArray(area.tiles) && area.tiles.length) return area.tiles;
  if (area.rect) return [area.rect];
  return [];
};

const subtractRect = (source, cut) => {
  if (!source || !cut) return source ? [source] : [];
  const x1 = source.x;
  const y1 = source.y;
  const x2 = source.x + source.w;
  const y2 = source.y + source.h;

  const cx1 = Math.max(x1, cut.x);
  const cy1 = Math.max(y1, cut.y);
  const cx2 = Math.min(x2, cut.x + cut.w);
  const cy2 = Math.min(y2, cut.y + cut.h);

  if (cx1 >= cx2 || cy1 >= cy2) {
    return [source];
  }

  const result = [];

  if (cy1 > y1) {
    result.push({
      x: x1,
      y: y1,
      w: source.w,
      h: cy1 - y1,
    });
  }
  if (cy2 < y2) {
    result.push({
      x: x1,
      y: cy2,
      w: source.w,
      h: y2 - cy2,
    });
  }

  const middleHeight = cy2 - cy1;
  if (middleHeight > 0) {
    if (cx1 > x1) {
      result.push({
        x: x1,
        y: cy1,
        w: cx1 - x1,
        h: middleHeight,
      });
    }
    if (cx2 < x2) {
      result.push({
        x: cx2,
        y: cy1,
        w: x2 - cx2,
        h: middleHeight,
      });
    }
  }

  return result;
};

const mergeSmallRectangles = (rects, tolerance = 0.5) =>
  rects.filter((rect) => rect.w > tolerance && rect.h > tolerance);

const shapeFromRect = (rect) =>
  rect
    ? {
        rect: { ...rect },
        tiles: [{ ...rect }],
        area: rectArea(rect),
      }
    : null;

const computeSelectionShape = (selectionRect, purchasedAreas) => {
  if (!selectionRect || selectionRect.w <= 0 || selectionRect.h <= 0) {
    return null;
  }

  let freeRects = [{ ...selectionRect }];
  purchasedAreas.forEach((area) => {
    const tiles = normalizeTiles(area);
    tiles.forEach((tile) => {
      freeRects = freeRects.flatMap((rect) => subtractRect(rect, tile));
    });
  });

  freeRects = mergeSmallRectangles(freeRects);
  if (!freeRects.length) return null;

  const totalArea = freeRects.reduce((sum, r) => sum + rectArea(r), 0);
  const roundedTiles = freeRects.map((r) => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.w),
    h: Math.round(r.h),
  }));
  const minX = Math.min(...roundedTiles.map((r) => r.x));
  const minY = Math.min(...roundedTiles.map((r) => r.y));
  const maxX = Math.max(...roundedTiles.map((r) => r.x + r.w));
  const maxY = Math.max(...roundedTiles.map((r) => r.y + r.h));

  return {
    rect: {
      x: minX,
      y: minY,
      w: Math.max(0, maxX - minX),
      h: Math.max(0, maxY - minY),
    },
    tiles: roundedTiles,
    area: totalArea,
  };
};

export default function Home() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [selectionShape, setSelectionShape] = useState(null);
  const [price, setPrice] = useState("0.00");
  const [liveShape, setLiveShape] = useState(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [start, setStart] = useState(null);
  const [liveRect, setLiveRect] = useState(null);
  const [purchasedAreas, setPurchasedAreas] = useState([]);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [hoverPreviewReveal, setHoverPreviewReveal] = useState(false);
  const [hoverPreviewLayout, setHoverPreviewLayout] = useState(null);
  const [canvasSize, setCanvasSize] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 0,
    height: typeof window !== "undefined" ? window.innerHeight : 0,
  }));
  const patternCanvasRef = useRef(null);
  const patternShiftRef = useRef(0);
  const patternVerticalShiftRef = useRef(0);
  const animationTimestampRef = useRef(0);
  const lastFrameRef = useRef(null);
  const purchaseIdRef = useRef(0);
  const linkPreviewCacheRef = useRef(new Map());
  const hoverPreviewCardRef = useRef(null);
  const hoverPreviewFetchRef = useRef(null);
  const hoverHideTimeoutRef = useRef(null);
  const [isLegalMenuOpen, setIsLegalMenuOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isDeveloperModalOpen, setIsDeveloperModalOpen] = useState(false);
  const [profile, setProfile] = useState(() => loadStoredProfile());
  const presenceStats = usePresenceStats();
  const persistProfile = useCallback((value) => {
    if (typeof window === "undefined") return;
    if (!value) {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(value));
    }
  }, []);

  const syncProfile = useCallback(
    (payload) => {
      if (!payload) {
        setProfile(null);
        persistProfile(null);
        return;
      }
      const next = {
        token: payload.token,
        profile: payload.profile,
        purchases: payload.purchases || [],
      };
      setProfile(next);
      persistProfile(next);
    },
    [persistProfile]
  );

  const refreshProfile = useCallback(async () => {
    if (!profile?.token) return;
    try {
      const data = await fetchProfile(profile.token);
      syncProfile({ token: profile.token, profile: data.profile, purchases: data.purchases });
    } catch (error) {
      console.error("Unable to refresh profile", error);
    }
  }, [profile?.token, syncProfile]);

  const viewportPixels = useMemo(() => {
    const width = Math.max(0, Math.round(canvasSize.width || 0));
    const height = Math.max(0, Math.round(canvasSize.height || 0));
    if (!width || !height) return 0;
    return width * height;
  }, [canvasSize]);

  const localPurchasedPixels = useMemo(
    () =>
      purchasedAreas.reduce((sum, area) => {
        if (!area) return sum;
        const areaValue = area.area ?? (area.rect ? rectArea(area.rect) : 0);
        return sum + Math.max(0, Math.round(areaValue || 0));
      }, 0),
    [purchasedAreas]
  );

  const remoteTotalPixels = Math.max(0, Math.round(presenceStats.board?.totalPixels || 0));
  const totalPixels = remoteTotalPixels || viewportPixels;
  const remotePurchasedPixels = Math.max(0, Math.round(presenceStats.purchasedPixels || 0));
  const purchasedPixels = remotePurchasedPixels || localPurchasedPixels;
  const remoteAvailablePixels = Math.max(0, Math.round(presenceStats.availablePixels || 0));
  const availablePixels = remoteAvailablePixels || Math.max(0, totalPixels - purchasedPixels);
  const totalRevenueEuros = Math.max(0, purchasedPixels * PRICE_PER_PIXEL);
  const donationEuros = totalRevenueEuros * 0.005;
  const ownedPurchases = profile?.purchases || [];
  const profileOwnedPixels = ownedPurchases.reduce((sum, item) => sum + Math.max(0, Math.round(item.area || 0)), 0);
  const onlineUsers = Math.max(0, Math.round(presenceStats.onlineUsers || 0));
  const remoteActiveSelections = Math.max(0, Math.round(presenceStats.activeSelections || 0));
  const remoteSelectedPixels = Math.max(0, Math.round(presenceStats.selectedPixels || 0));
  const currentSelectionPixels = Math.max(0, Math.round(liveShape?.area || 0));
  const localActiveSelectors = isSelecting || liveShape ? 1 : 0;
  const activeSelectors = Math.max(remoteActiveSelections, localActiveSelectors);
  const currentSelectedPixels = Math.max(remoteSelectedPixels, currentSelectionPixels);

  usePresenceSync({
    selectionPixels: currentSelectionPixels,
    isSelecting: Boolean(isSelecting || liveShape),
  });

  const legalStats = useMemo(
    () => ({
      totalPixels,
      purchasedPixels,
      availablePixels,
      onlineUsers,
      activeSelections: activeSelectors,
      currentSelectionPixels: currentSelectedPixels,
      totalRevenueEuros,
      donationEuros,
      profileAvatar: profile?.profile?.avatarData || null,
      profilePixels: profileOwnedPixels,
    }),
    [
      totalPixels,
      purchasedPixels,
      availablePixels,
      onlineUsers,
      activeSelectors,
      currentSelectionPixels,
      totalRevenueEuros,
      donationEuros,
      profile?.profile?.avatarData,
      profileOwnedPixels,
    ]
  );

  const clearHoverHideTimeout = useCallback(() => {
    if (hoverHideTimeoutRef.current) {
      clearTimeout(hoverHideTimeoutRef.current);
      hoverHideTimeoutRef.current = null;
    }
  }, []);

  const scheduleHoverHide = useCallback(() => {
    clearHoverHideTimeout();
    hoverHideTimeoutRef.current = setTimeout(() => {
      setHoverPreview(null);
      setHoverPreviewReveal(false);
      setHoverPreviewLayout(null);
      hoverHideTimeoutRef.current = null;
    }, 400);
  }, [clearHoverHideTimeout]);

  const openLegalMenu = useCallback(() => setIsLegalMenuOpen(true), []);
  const closeLegalMenu = useCallback(() => setIsLegalMenuOpen(false), []);
  const openProfileModal = useCallback(() => {
    if (profile?.token) {
      refreshProfile();
    }
    setIsProfileModalOpen(true);
  }, [profile?.token, refreshProfile]);
  const closeProfileModal = useCallback(() => setIsProfileModalOpen(false), []);
  const openDeveloperModal = useCallback(() => setIsDeveloperModalOpen(true), []);
  const closeDeveloperModal = useCallback(() => setIsDeveloperModalOpen(false), []);
  const handleProfileSaved = useCallback(
    (savedProfile) => {
      syncProfile(savedProfile);
    },
    [syncProfile]
  );

  useEffect(() => () => clearHoverHideTimeout(), [clearHoverHideTimeout]);

  useEffect(() => {
    const handler = (event) => {
      if (event.altKey && event.shiftKey && event.code === "KeyD") {
        event.preventDefault();
        setIsDeveloperModalOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (profile?.token) {
      refreshProfile();
    }
  }, [profile?.token, refreshProfile]);

  useEffect(() => {
    let cancelled = false;
    const loadPurchases = async () => {
      try {
        const purchases = await fetchPurchases();
        if (cancelled) return;
        setPurchasedAreas(purchases);
        purchases.forEach((purchase) => {
          if (purchase?.link && purchase?.previewData) {
            linkPreviewCacheRef.current.set(purchase.link, purchase.previewData);
          }
        });
      } catch (error) {
        console.error("Unable to load purchases", error);
      }
    };
    loadPurchases();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const gridSize = 25;
    const TILE_SIZE = 96;

    const buildSelectionPattern = () => {
      let patternCanvas = patternCanvasRef.current;
      if (!patternCanvas) {
        patternCanvas = document.createElement("canvas");
        patternCanvas.width = TILE_SIZE;
        patternCanvas.height = TILE_SIZE;
        patternCanvasRef.current = patternCanvas;
      }

      const patternCtx = patternCanvas.getContext("2d");
      if (!patternCanvas.__isDrawn) {
        patternCtx.clearRect(0, 0, patternCanvas.width, patternCanvas.height);
        patternCtx.fillStyle = "rgba(255,165,0,0.12)";
        patternCtx.fillRect(0, 0, patternCanvas.width, patternCanvas.height);

        const spacing = TILE_SIZE / 4;
        const primaryLineColor = "rgba(255,200,120,0.55)";
        const secondaryLineColor = "rgba(255,180,90,0.35)";

        patternCtx.lineWidth = 1.4;
        for (let i = -TILE_SIZE * 2; i <= TILE_SIZE * 2; i += spacing) {
          patternCtx.strokeStyle = primaryLineColor;
          patternCtx.beginPath();
          patternCtx.moveTo(i, -TILE_SIZE * 2);
          patternCtx.lineTo(i + TILE_SIZE * 4, TILE_SIZE * 2);
          patternCtx.stroke();

          patternCtx.strokeStyle = secondaryLineColor;
          patternCtx.beginPath();
          patternCtx.moveTo(i, TILE_SIZE * 2);
          patternCtx.lineTo(i + TILE_SIZE * 4, -TILE_SIZE * 2);
          patternCtx.stroke();
        }

        const dotSpacing = spacing;
        for (let x = -TILE_SIZE; x <= TILE_SIZE * 2; x += dotSpacing) {
          for (let y = -TILE_SIZE; y <= TILE_SIZE * 2; y += dotSpacing) {
            const parity =
              (Math.round(x / dotSpacing) + Math.round(y / dotSpacing)) % 2;
            const radius = parity === 0 ? 3 : 1.8;
            patternCtx.beginPath();
            patternCtx.fillStyle =
              parity === 0
                ? "rgba(255,255,255,0.7)"
                : "rgba(255,255,255,0.35)";
            patternCtx.arc(x, y, radius, 0, Math.PI * 2);
            patternCtx.fill();
          }
        }

        patternCanvas.__isDrawn = true;
      }

      const pattern = ctx.createPattern(patternCanvas, "repeat");
      if (pattern && typeof pattern.setTransform === "function") {
        const offsetX = patternShiftRef.current % TILE_SIZE;
        const baseY = patternVerticalShiftRef.current % TILE_SIZE;
        const ripple = Math.sin(animationTimestampRef.current * 0.0014) * TILE_SIZE * 0.22;
        const offsetY = (baseY + ripple + TILE_SIZE * 2) % TILE_SIZE;
        const matrix = new DOMMatrix();
        matrix.e = -offsetX;
        matrix.f = -offsetY;
        pattern.setTransform(matrix);
      }
      return pattern;
    };

    const drawGrid = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0b0f14";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    };

    const drawPurchasedAreas = () => {
      if (!purchasedAreas.length) return;
      purchasedAreas.forEach((area) => {
        const tiles = normalizeTiles(area);
        tiles.forEach((tile) => {
          if (!tile || tile.w <= 0 || tile.h <= 0) return;
          ctx.save();
          ctx.fillStyle = "rgba(255,165,0,0.08)";
          ctx.strokeStyle = "rgba(255,165,0,0.35)";
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 12;
          ctx.shadowColor = "rgba(255,165,0,0.28)";
          ctx.beginPath();
          ctx.rect(tile.x, tile.y, tile.w, tile.h);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowColor = "transparent";
          ctx.stroke();
          ctx.restore();
        });
      });
    };

    const drawSelectionRect = (rect) => {
      if (!rect || rect.w <= 0 || rect.h <= 0) return;
      ctx.save();
      const pattern = buildSelectionPattern();
      ctx.fillStyle = pattern || "rgba(255,165,0,0.25)";
      ctx.strokeStyle = "rgba(255,165,0,0.9)";
      ctx.lineWidth = 2;
      ctx.shadowColor = "rgba(255,165,0,0.45)";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      if (rect.w > 0) {
        const time = animationTimestampRef.current;
        const cycle = (time * 0.00008) % 2;
        const easedCycle = cycle < 1
          ? 0.5 * (1 - Math.cos(Math.PI * cycle))
          : 0.5 + 0.5 * (1 - Math.cos(Math.PI * (cycle - 1)));

        const detourPhase = Math.sin(time * 0.0008) * 0.09;
        const highlightOffset =
          ((patternShiftRef.current % TILE_SIZE) / TILE_SIZE + easedCycle + detourPhase + 1) % 1;
        const highlightSpan = 0.26 + 0.12 * Math.sin(time * 0.00035 + highlightOffset * Math.PI * 0.5);
        const startStop = Math.max(0, highlightOffset - highlightSpan / 2);
        const endStop = Math.min(1, highlightOffset + highlightSpan / 2);
        const midStop = (startStop + endStop) / 2;

        const horizontalGradient = ctx.createLinearGradient(
          rect.x,
          rect.y,
          rect.x + rect.w,
          rect.y
        );
        horizontalGradient.addColorStop(
          Math.max(0, startStop - 0.2),
          "rgba(255,210,120,0)"
        );
        horizontalGradient.addColorStop(startStop, "rgba(255,215,130,0.035)");
        horizontalGradient.addColorStop(midStop, "rgba(255,235,185,0.28)");
        horizontalGradient.addColorStop(endStop, "rgba(255,215,130,0.035)");
        horizontalGradient.addColorStop(
          Math.min(1, endStop + 0.2),
          "rgba(255,210,120,0)"
        );

        const wrapGradient = ctx.createLinearGradient(
          rect.x,
          rect.y,
          rect.x + rect.w,
          rect.y
        );
        wrapGradient.addColorStop(
          Math.max(0, startStop - 0.4),
          "rgba(255,180,100,0.02)"
        );
        wrapGradient.addColorStop(
          Math.max(0, startStop - 0.22),
          "rgba(255,195,120,0.06)"
        );
        wrapGradient.addColorStop(
          Math.min(1, endStop + 0.22),
          "rgba(255,195,120,0.06)"
        );
        wrapGradient.addColorStop(
          Math.min(1, endStop + 0.4),
          "rgba(255,180,100,0.02)"
        );

        const verticalWave = (Math.sin(time * 0.00045 + rect.x * 0.013) + 1) / 2;
        const verticalGradient = ctx.createLinearGradient(
          rect.x,
          rect.y,
          rect.x,
          rect.y + rect.h
        );
        verticalGradient.addColorStop(0, "rgba(255,215,130,0)");
        verticalGradient.addColorStop(
          0.25 + verticalWave * 0.25,
          "rgba(255,210,130,0.035)"
        );
        verticalGradient.addColorStop(
          0.5 + verticalWave * 0.3,
          "rgba(255,230,160,0.12)"
        );
        verticalGradient.addColorStop(1, "rgba(255,200,120,0.02)");

        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = wrapGradient;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = horizontalGradient;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = verticalGradient;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }

      ctx.stroke();
      ctx.restore();
    };
    const drawSelection = (shape) => {
      if (!shape) return;
      const tiles = shape.tiles && shape.tiles.length ? shape.tiles : shape.rect ? [shape.rect] : [];
      tiles.forEach((tile) => drawSelectionRect(tile));
    };

    const resizeCanvas = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
      setCanvasSize((prev) => {
        if (prev.width === width && prev.height === height) {
          return prev;
        }
        return { width, height };
      });
      drawGrid();
      drawPurchasedAreas();
      const activeShape = liveShape || selectionShape || (liveRect ? shapeFromRect(liveRect) : null);
      if (activeShape) drawSelection(activeShape);
    };

    let animationFrame;
    const render = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const last = lastFrameRef.current ?? now;
      const delta = Math.min(80, now - last);
      lastFrameRef.current = now;
      animationTimestampRef.current = now;

      patternShiftRef.current =
        (patternShiftRef.current + delta * 0.045 + delta * 0.009 * Math.sin(now * 0.001)) %
        (TILE_SIZE * 1000);
      patternVerticalShiftRef.current =
        (patternVerticalShiftRef.current + delta * 0.02) % (TILE_SIZE * 1000);

      drawGrid();
      drawPurchasedAreas();

      const activeShape = liveShape || selectionShape;
      if (activeShape) {
        drawSelection(activeShape);
      }

      if (isSelecting || activeShape) {
        animationFrame = requestAnimationFrame(render);
      } else {
        lastFrameRef.current = null;
      }
    };
    render();

    const handleMouseDown = (e) => {
      if (selectionShape) return;
      setIsSelecting(true);
      setStart({ x: e.clientX, y: e.clientY });
      setSelectionShape(null);
      setLiveShape(null);
      setPrice((0).toFixed(2));
      setHoverPreview(null);
      patternShiftRef.current = 0;
      patternVerticalShiftRef.current = 0;
      animationTimestampRef.current = 0;
      lastFrameRef.current = null;
    };

    const handleMouseMove = (e) => {
      if (!isSelecting || !start) return;
      const rect = {
        x: Math.min(start.x, e.clientX),
        y: Math.min(start.y, e.clientY),
        w: Math.abs(start.x - e.clientX),
        h: Math.abs(start.y - e.clientY),
      };
      setLiveRect(rect);
      const shape = computeSelectionShape(rect, purchasedAreas);
      setLiveShape(shape);
      const totalPx = shape?.area ?? 0;
      setPrice((totalPx * PRICE_PER_PIXEL).toFixed(2));
    };

    const handleMouseUp = () => {
      if (!liveRect) return;
      const shape = computeSelectionShape(liveRect, purchasedAreas);
      if (!shape) {
        setSelectionShape(null);
        setPrice((0).toFixed(2));
      } else {
        setSelectionShape(shape);
        setPrice((shape.area * PRICE_PER_PIXEL).toFixed(2));
      }
      setLiveRect(null);
      setLiveShape(null);
      setIsSelecting(false);
    };

    window.addEventListener("resize", resizeCanvas);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);

    resizeCanvas();

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSelecting, start, liveRect, liveShape, selectionShape, purchasedAreas]);

  const resetAnimationState = useCallback(() => {
    patternShiftRef.current = 0;
    patternVerticalShiftRef.current = 0;
    animationTimestampRef.current = 0;
    lastFrameRef.current = null;
  }, []);

  const fetchLinkPreview = useCallback(async (url) => {
    if (!url) return null;
    const cache = linkPreviewCacheRef.current;
    if (cache.has(url)) {
      return cache.get(url);
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(
        `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&palette=true&meta=false`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error("Preview request failed");
      const json = await response.json();
      const data = json?.data || {};
      const screenshotUrl = data.screenshot?.url || data.image?.url || null;
      const logoUrl = data.logo?.url || data.icon?.url || null;
      const paletteColor = data.palette?.vibrant || data.palette?.color || null;
      const preview = {
        image: screenshotUrl,
        title: data.title || "",
        description: data.description || "",
        logo: logoUrl,
        accent: paletteColor,
      };
      cache.set(url, preview);
      return preview;
    } catch (error) {
      console.warn("Unable to fetch link preview", error);
      linkPreviewCacheRef.current.set(url, null);
      return null;
    }
  }, []);

  const handleFinalizePurchase = useCallback(
    async (payload) => {
      if (!payload || !payload.rect) return;
      purchaseIdRef.current += 1;
      const areaId = `purchase-${purchaseIdRef.current}`;
      const initialPreview = payload.previewData || null;
      const baseArea = {
        id: areaId,
        rect: payload.rect,
        tiles: payload.tiles && payload.tiles.length ? payload.tiles : [payload.rect],
        area: payload.area ?? rectArea(payload.rect),
        link: payload.link,
        price: Number(payload.price || 0),
        uploadedImage: payload.uploadedImage,
        imageTransform: payload.imageTransform || DEFAULT_TRANSFORM,
        previewData: initialPreview,
        nsfw: Boolean(payload.nsfw),
      };
      setPurchasedAreas((prev) => [...prev, baseArea]);

      if (payload.link && initialPreview) {
        linkPreviewCacheRef.current.set(payload.link, initialPreview);
      }

      setSelectionShape(null);
      setLiveShape(null);
      setLiveRect(null);
      setPrice("0.00");
      setIsSelecting(false);
      resetAnimationState();

      try {
        const saved = await createPurchase(
          {
            id: areaId,
            rect: baseArea.rect,
            tiles: baseArea.tiles,
            area: baseArea.area,
            price: baseArea.price,
            link: baseArea.link,
            uploadedImage: baseArea.uploadedImage,
            imageTransform: baseArea.imageTransform,
            previewData: baseArea.previewData,
            nsfw: baseArea.nsfw,
          },
          profile?.token
        );
        setPurchasedAreas((prev) =>
          prev.map((area) =>
            area.id === areaId
              ? {
                  ...area,
                  ...saved,
                  previewData: saved.previewData || area.previewData || null,
                }
              : area
          )
        );
        if (saved?.link && saved?.previewData) {
          linkPreviewCacheRef.current.set(saved.link, saved.previewData);
        }
        if (profile?.token) {
          syncProfile({
            token: profile.token,
            profile: profile.profile,
            purchases: [...(profile.purchases || []), saved],
          });
          refreshProfile();
        }
      } catch (error) {
        console.error("Failed to persist purchase", error);
      }

      if (payload.link && !initialPreview) {
        const preview = await fetchLinkPreview(payload.link);
        if (preview) {
          setPurchasedAreas((prev) =>
            prev.map((area) =>
              area.id === areaId
                ? {
                    ...area,
                    previewData: preview,
                  }
                : area
            )
          );
        }
      }
    },
    [createPurchase, fetchLinkPreview, resetAnimationState]
  );

  const handleAreaMouseLeave = useCallback((event) => {
    const relatedTarget = event?.relatedTarget;
    if (relatedTarget instanceof Element) {
      const currentAreaId =
        event?.currentTarget instanceof Element
          ? event.currentTarget.getAttribute("data-area-id")
          : null;
      const targetAreaAncestor = relatedTarget.closest("[data-area-id]");
      if (
        targetAreaAncestor &&
        currentAreaId &&
        targetAreaAncestor.getAttribute("data-area-id") === currentAreaId
      ) {
        return;
      }
      if (relatedTarget.closest(".link-preview-card")) {
        return;
      }
    }
    scheduleHoverHide();
  }, [scheduleHoverHide]);

  const handleAreaMouseEnter = useCallback(
    (area) => {
      clearHoverHideTimeout();
      if (!area || !area.link || !containerRef.current || isSelecting || selectionShape) {
        setHoverPreview(null);
        setHoverPreviewReveal(false);
        return;
      }
      if (hoverPreview?.areaId !== area.id) {
        setHoverPreviewReveal(false);
      }
      setHoverPreviewLayout(null);
      const container = containerRef.current;
      const containerHeight = container.clientHeight || 0;
      const anchorX = area.rect.x + area.rect.w / 2;
      const preferTop = area.rect.y > containerHeight * 0.35;
      const anchorY = preferTop ? area.rect.y : area.rect.y + area.rect.h;
      setHoverPreview({
        areaId: area.id,
        x: anchorX,
        y: anchorY,
        position: preferTop ? "top" : "bottom",
      });
    },
    [clearHoverHideTimeout, hoverPreview, isSelecting, selectionShape]
  );

  useLayoutEffect(() => {
    if (!hoverPreview) {
      setHoverPreviewLayout(null);
      return;
    }
    const updateLayout = () => {
      if (!hoverPreviewCardRef.current) return;
      const cardRect = hoverPreviewCardRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 24;
      const gap = 18;
      const anchorX = hoverPreview.x;
      const anchorY = hoverPreview.y;

      let orientation = hoverPreview.position;
      let left = anchorX - cardRect.width / 2;
      left = Math.max(margin, Math.min(left, viewportWidth - cardRect.width - margin));

      const hasSpaceBelow =
        anchorY + gap + cardRect.height + margin <= viewportHeight;
      const hasSpaceAbove = anchorY - gap - cardRect.height - margin >= 0;

      if (orientation === "bottom" && !hasSpaceBelow && hasSpaceAbove) {
        orientation = "top";
      } else if (orientation === "top" && !hasSpaceAbove && hasSpaceBelow) {
        orientation = "bottom";
      }

      let top;
      if (orientation === "bottom") {
        top = Math.min(anchorY + gap, viewportHeight - cardRect.height - margin);
      } else {
        top = Math.max(anchorY - cardRect.height - gap, margin);
      }

      setHoverPreviewLayout({ left, top, orientation });
    };

    updateLayout();

    const handleResize = () => updateLayout();
    window.addEventListener("resize", handleResize);

    let observer;
    if (typeof ResizeObserver !== "undefined" && hoverPreviewCardRef.current) {
      observer = new ResizeObserver(() => updateLayout());
      observer.observe(hoverPreviewCardRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (observer) observer.disconnect();
    };
  }, [hoverPreview, hoverPreviewReveal, purchasedAreas]);

  useEffect(() => {
    if (!hoverPreview) {
      hoverPreviewFetchRef.current = null;
      return;
    }
    const previewArea = purchasedAreas.find((area) => area.id === hoverPreview.areaId);
    if (!previewArea || !previewArea.link) return;
    if (previewArea.previewData?.image) return;
    if (hoverPreviewFetchRef.current === previewArea.link) return;

    let cancelled = false;
    hoverPreviewFetchRef.current = previewArea.link;
    fetchLinkPreview(previewArea.link)
      .then((preview) => {
        if (cancelled || !preview) return;
        setPurchasedAreas((prev) =>
          prev.map((area) =>
            area.id === previewArea.id
              ? {
                  ...area,
                  previewData: preview,
                }
              : area
          )
        );
      })
      .catch(() => {
        // Ignore errors here; they'll fall back to placeholder
      })
      .finally(() => {
        if (!cancelled && hoverPreviewFetchRef.current === previewArea.link) {
          hoverPreviewFetchRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hoverPreview, purchasedAreas, fetchLinkPreview]);

  const openAreaLink = useCallback((area) => {
    if (!area || !area.link) return;
    try {
      window.open(area.link, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.warn("Unable to open link", error);
    }
  }, []);

  const handleAreaKeyDown = useCallback(
    (area) => (event) => {
      if (!area || !area.link) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openAreaLink(area);
      }
    },
    [openAreaLink]
  );

  const formatLink = useCallback((url) => {
    if (!url) return "";
    try {
      const hostname = new URL(url).hostname.replace(/^www\./, "");
      return hostname;
    } catch {
      return url;
    }
  }, []);

  const truncateLink = useCallback((url) => {
    if (!url) return "";
    const trimmed = url.trim();
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed;
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "#0b0f14",
        overflow: "hidden",
        position: "relative",
      }}
      ref={containerRef}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          display: "block",
          cursor: "crosshair",
        }}
      />

      {purchasedAreas.map((area) => {
        if (!area.rect) return null;
        const tiles = normalizeTiles(area);
        if (!tiles.length) return null;
        const bounds = area.rect;
        const appliedTransform = area.imageTransform || DEFAULT_TRANSFORM;
        const boundsWidth = bounds.w;
        const boundsHeight = bounds.h;
        const imageWidth = Math.max(boundsWidth * appliedTransform.width, 1);
        const imageHeight = Math.max(boundsHeight * appliedTransform.height, 1);
        const imageOffsetX = appliedTransform.x * boundsWidth;
        const imageOffsetY = appliedTransform.y * boundsHeight;

        return (
          <React.Fragment key={area.id}>
            {tiles.map((tile, index) => {
              if (!tile || tile.w <= 0 || tile.h <= 0) return null;
              const relativeLeft = tile.x - bounds.x;
              const relativeTop = tile.y - bounds.y;
              const tileKey = `${area.id}-tile-${index}`;
              const isPrimaryTile = index === 0;
              const commonProps = area.link
                ? {
                    role: "button",
                    tabIndex: isPrimaryTile ? 0 : -1,
                    onKeyDown: isPrimaryTile ? handleAreaKeyDown(area) : undefined,
                    onFocus: isPrimaryTile ? () => handleAreaMouseEnter(area) : undefined,
                    onBlur: isPrimaryTile ? handleAreaMouseLeave : undefined,
                    "aria-label": isPrimaryTile ? `Open link ${area.link}` : undefined,
                  }
                : {
                    tabIndex: -1,
                    role: "presentation",
                    "aria-label": undefined,
                  };

              return (
                <div
                  key={tileKey}
                  className={`purchased-area-tile${area.link ? " has-link" : ""}`}
                  data-area-id={area.id}
                  style={{
                    left: `${tile.x}px`,
                    top: `${tile.y}px`,
                    width: `${tile.w}px`,
                    height: `${tile.h}px`,
                  }}
                  onMouseEnter={() => handleAreaMouseEnter(area)}
                  onMouseLeave={handleAreaMouseLeave}
                  onClick={() => area.link && openAreaLink(area)}
                  {...commonProps}
                >
                  {area.uploadedImage ? (
                    <div
                      className="purchased-area-image"
                      style={{
                        backgroundImage: `url(${area.uploadedImage})`,
                        backgroundRepeat: "no-repeat",
                        backgroundSize: `${imageWidth}px ${imageHeight}px`,
                        backgroundPosition: `${imageOffsetX - relativeLeft}px ${imageOffsetY - relativeTop}px`,
                      }}
                    />
                  ) : (
                    <div className="purchased-area-placeholder" />
                  )}
                </div>
              );
            })}
          </React.Fragment>
        );
      })}

      {hoverPreview && (() => {
        const previewArea = purchasedAreas.find((area) => area.id === hoverPreview.areaId);
        if (!previewArea || !previewArea.link || isSelecting || selectionShape) return null;
        const accent = previewArea.previewData?.accent;
        const isBlurred = previewArea.nsfw && !hoverPreviewReveal;
        const orientation = hoverPreviewLayout?.orientation ?? hoverPreview.position;
        const accentStyle = accent
          ? {
              borderColor: accent,
              boxShadow: `0 22px 38px rgba(0,0,0,0.45), 0 0 32px ${accent}`,
            }
          : {};
        const fallbackStyle = {
          left: `${hoverPreview.x}px`,
          top: `${hoverPreview.y}px`,
          visibility: "hidden",
        };
        const computedStyle = hoverPreviewLayout
          ? {
              left: `${hoverPreviewLayout.left}px`,
              top: `${hoverPreviewLayout.top}px`,
              visibility: "visible",
            }
          : fallbackStyle;
        return (
          <div
            className={`link-preview-card${
              orientation === "bottom" ? " align-bottom" : ""
            }${hoverHideTimeoutRef.current ? " fade-out" : ""}`}
            ref={hoverPreviewCardRef}
            style={{ ...computedStyle, ...accentStyle }}
            onMouseEnter={clearHoverHideTimeout}
            onMouseLeave={(event) => {
              const relatedTarget = event?.relatedTarget;
              if (
                relatedTarget instanceof Element &&
                (relatedTarget.closest("[data-area-id]") || relatedTarget.closest(".link-preview-card"))
              ) {
                const targetAreaAncestor = relatedTarget.closest("[data-area-id]");
                if (targetAreaAncestor && targetAreaAncestor.getAttribute("data-area-id") === previewArea.id) {
                  return;
                }
                if (relatedTarget.closest(".link-preview-card")) {
                  return;
                }
              }
              scheduleHoverHide();
            }}
          >
            {previewArea.previewData?.image && (!previewArea.nsfw || hoverPreviewReveal) ? (
              <div className="preview-thumb">
                <img
                  src={previewArea.previewData.image}
                  alt="Link preview"
                  draggable={false}
                />
              </div>
            ) : (
              <div className={`preview-thumb placeholder${isBlurred ? " blurred" : ""}`}>
                {previewArea.previewData?.logo ? (
                  <img
                    src={previewArea.previewData.logo}
                    alt="Link icon"
                    style={{ width: 48, height: 48, objectFit: "contain" }}
                    draggable={false}
                  />
                ) : (
                  <span>Link</span>
                )}
              </div>
            )}
            {previewArea.nsfw && (
              <div className="preview-blur-toggle-row">
                <span className="preview-blur-toggle-status">
                  {isBlurred ? "Blurred" : "Revealed"}
                </span>
                <button
                  type="button"
                  className={`preview-blur-toggle${hoverPreviewReveal ? " active" : ""}`}
                  aria-pressed={hoverPreviewReveal}
                  aria-label={hoverPreviewReveal ? "Hide sensitive preview" : "Reveal sensitive preview"}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (previewArea?.nsfw) {
                      setHoverPreviewReveal((prev) => !prev);
                    }
                  }}
                >
                  <span className="preview-blur-toggle-thumb" />
                </button>
              </div>
            )}
            <div className="preview-domain">{formatLink(previewArea.link)}</div>
            <a
              className="preview-link"
              href={previewArea.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                event.preventDefault();
                openAreaLink(previewArea);
              }}
            >
              {truncateLink(previewArea.link)}
            </a>
            <div className="preview-open-hint">Click to open link</div>
          </div>
        );
      })()}

      {(() => {
        const activePopupArea = selectionShape || liveShape;
        if (!activePopupArea) return null;
        return (
        <SelectionPopup
          area={activePopupArea}
          price={price}
          onClose={() => {
            setSelectionShape(null);
            setLiveShape(null);
            setLiveRect(null);
            setPrice("0.00");
            resetAnimationState();
          }}
          onFinalizePurchase={handleFinalizePurchase}
        />
        );
      })()}

      <div
        className={`center-hamburger${liveRect || selectionShape ? " hidden" : ""}`}
        aria-label="Open legal menu"
        role="button"
        tabIndex={0}
        onClick={openLegalMenu}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openLegalMenu();
          }
        }}
        aria-expanded={isLegalMenuOpen}
        aria-controls="legalMenuPanel"
        title="Legal documentation"
      >
        <span />
        <span />
        <span />
      </div>

      <LegalMenu
        isOpen={isLegalMenuOpen}
        onClose={closeLegalMenu}
        documents={legalDocuments}
        stats={legalStats}
        onRequestProfile={openProfileModal}
        panelId="legalMenuPanel"
      />
      <ProfileManagerModal
        isOpen={isProfileModalOpen}
        onClose={closeProfileModal}
        profile={profile?.profile || null}
        purchases={profile?.purchases || []}
        token={profile?.token || null}
        onProfileSync={handleProfileSaved}
        onRefreshProfile={refreshProfile}
      />
      <DeveloperConsole isOpen={isDeveloperModalOpen} onClose={closeDeveloperModal} />
    </div>
  );
}
