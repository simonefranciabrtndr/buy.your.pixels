import { useEffect, useRef, useState } from "react";

export function useZoomPan({
  minZoom = 0.5,
  maxZoom = 3,
  initialZoom = 1,
}) {
  const [zoom, setZoom] = useState(initialZoom);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);

  // Track velocity for inertia
  const velocity = useRef({ x: 0, y: 0 });
  const lastFrameTime = useRef(null);
  const isDragging = useRef(false);

  const lastTouch = useRef(null);
  const lastMousePos = useRef(null);

  const clampZoom = (value) => Math.min(maxZoom, Math.max(minZoom, value));

  // Scroll wheel zoom
  const onWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => clampZoom(z + delta));
  };

  // MOUSE DRAG ------------------------------------------------------
  const onMouseDown = (e) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    velocity.current = { x: 0, y: 0 };
  };

  const onMouseMove = (e) => {
    if (!isDragging.current) return;

    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    setPanX((p) => p + dx);
    setPanY((p) => p + dy);

    velocity.current = { x: dx, y: dy };

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = () => {
    isDragging.current = false;
  };

  const onMouseLeave = onMouseUp;

  // TOUCH HANDLING --------------------------------------------------
  const onTouchStart = (e) => {
    if (e.touches.length === 2) {
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      lastTouch.current = { dist, zoom };
    } else if (e.touches.length === 1) {
      lastTouch.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
    velocity.current = { x: 0, y: 0 };
  };

  const onTouchMove = (e) => {
    if (e.touches.length === 2 && lastTouch.current?.dist) {
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const scale = dist / lastTouch.current.dist;
      setZoom(clampZoom(lastTouch.current.zoom * scale));
    } else if (e.touches.length === 1 && lastTouch.current?.x !== undefined) {
      const { clientX, clientY } = e.touches[0];
      const dx = clientX - lastTouch.current.x;
      const dy = clientY - lastTouch.current.y;

      setPanX((p) => p + dx);
      setPanY((p) => p + dy);

      velocity.current = { x: dx, y: dy };
      lastTouch.current = { x: clientX, y: clientY };
    }
  };

  const onTouchEnd = () => {
    lastTouch.current = null;
  };

  // MOMENTUM LOOP ---------------------------------------------------
  useEffect(() => {
    let animationFrame;

    const animate = (time) => {
      if (lastFrameTime.current == null) lastFrameTime.current = time;
      const dt = time - lastFrameTime.current;
      lastFrameTime.current = time;

      if (!isDragging.current) {
        // Apply velocity
        if (Math.abs(velocity.current.x) > 0.1 || Math.abs(velocity.current.y) > 0.1) {
          setPanX((p) => p + velocity.current.x);
          setPanY((p) => p + velocity.current.y);

          // Apply friction
          velocity.current.x *= 0.94;
          velocity.current.y *= 0.94;
        }
      }

      animationFrame = requestAnimationFrame(animate);
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, []);

  // Prevent gesture zoom conflict
  useEffect(() => {
    const handler = (e) => e.preventDefault();
    document.addEventListener("gesturestart", handler);
    return () => document.removeEventListener("gesturestart", handler);
  }, []);

  return {
    zoom,
    panX,
    panY,
    handlers: {
      onWheel,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
    setZoom,
    setPanX,
    setPanY,
  };
}
