import React, { useRef, useEffect, useState } from "react";

export default function Home() {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [start, setStart] = useState(null);
  const [current, setCurrent] = useState(null);
  const size = 1000; // 1000x1000 pixel effettivi

  useEffect(() => {
    document.body.style = "margin:0; padding:0; overflow:hidden; background:#000;";
    document.documentElement.style = "margin:0; padding:0; overflow:hidden;";

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    canvas.width = size;
    canvas.height = size;
    drawGrid(ctx);
  }, []);

  const drawGrid = (ctx) => {
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= size; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, x + 0.5);
      ctx.lineTo(size, x + 0.5);
      ctx.stroke();
    }
  };

  const getMousePosition = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e) => {
    setStart(getMousePosition(e));
    setIsDrawing(true);
  };

  const handleMouseMove = (e) => {
    if (!isDrawing) return;
    setCurrent(getMousePosition(e));
  };

  const handleMouseUp = () => setIsDrawing(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    drawGrid(ctx);

    if (start && current) {
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      ctx.fillStyle = "rgba(255,165,0,0.25)";
      ctx.strokeStyle = "#ffae00";
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
  }, [current, start]);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#000",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          display: "block",
          width: "min(90vmin, 1000px)",
          height: "min(90vmin, 1000px)",
          cursor: "crosshair",
          background: "radial-gradient(circle at center, #000 0%, #050505 100%)",
        }}
      />
    </div>
  );
}
