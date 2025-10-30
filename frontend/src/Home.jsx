import React, { useRef, useState, useEffect } from "react";
import "./styles/global.css";

export default function Home() {
  const canvasRef = useRef(null);
  const cropCanvasRef = useRef(null);
  const [isDragging, setDragging] = useState(false);
  const [start, setStart] = useState(null);
  const [current, setCurrent] = useState(null);
  const [selection, setSelection] = useState(null);
  const [price, setPrice] = useState(0);
  const [showPopup, setShowPopup] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [step, setStep] = useState("summary"); // summary | link | upload | crop
  const [link, setLink] = useState("");
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [draggingImage, setDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [aspectRatio, setAspectRatio] = useState(1);

  const PRICE_PER_PIXEL = 0.04;

  // Draw the main grid (wall)
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    function drawGrid() {
      const size = 25;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = "rgba(255,165,0,0.1)";
      ctx.lineWidth = 0.5;

      for (let x = 0; x < canvas.width; x += size) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let y = 0; y < canvas.height; y += size) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      if (selection) {
        ctx.fillStyle = "rgba(255,165,0,0.3)";
        ctx.strokeStyle = "rgba(255,165,0,0.9)";
        ctx.lineWidth = 2;
        ctx.fillRect(selection.x, selection.y, selection.width, selection.height);
        ctx.strokeRect(selection.x, selection.y, selection.width, selection.height);
      }
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawGrid();
    };

    resize();
    window.addEventListener("resize", resize);
    const interval = setInterval(drawGrid, 30);

    return () => {
      window.removeEventListener("resize", resize);
      clearInterval(interval);
    };
  }, [selection]);

  // Mouse helpers
  const getMouse = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e) => {
    setDragging(true);
    const p = getMouse(e);
    setStart(p);
    setCurrent(p);
    setShowPopup(true);
    setFadeOut(false);
    setStep("summary");
  };

  const onMove = (e) => {
    if (!isDragging) return;
    const p = getMouse(e);
    setCurrent(p);
    const width = Math.abs(p.x - start.x);
    const height = Math.abs(p.y - start.y);
    setPrice(width * height * PRICE_PER_PIXEL);
    setSelection({
      x: Math.min(start.x, p.x),
      y: Math.min(start.y, p.y),
      width,
      height,
    });
  };

  const onUp = () => setDragging(false);

  const cancelSelection = () => {
    setFadeOut(true);
    setTimeout(() => {
      setSelection(null);
      setShowPopup(false);
      setPrice(0);
      setFadeOut(false);
      setLink("");
      setImage(null);
      setStep("summary");
    }, 400);
  };

  const handleProceed = () => setStep("link");
  const handleLinkNext = () => setStep("upload");

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setImage(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleContinueToCrop = () => {
    if (image && selection) {
      setAspectRatio(selection.width / selection.height);
      setStep("crop");
    }
  };

  const handleContinuePayment = () => {
    alert("Proceeding to payment (Stripe integration pending)");
  };

  // Crop editor logic
  useEffect(() => {
    if (step !== "crop" || !image) return;
    const canvas = cropCanvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.src = image;

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Image
      const imgW = img.width * zoom;
      const imgH = img.height * zoom;
      const posX = offset.x + (canvas.width - imgW) / 2;
      const posY = offset.y + (canvas.height - imgH) / 2;
      ctx.drawImage(img, posX, posY, imgW, imgH);

      // Overlay mask
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Calculate crop area maintaining ratio
      let cropW = canvas.width * 0.6;
      let cropH = cropW / aspectRatio;
      if (cropH > canvas.height * 0.6) {
        cropH = canvas.height * 0.6;
        cropW = cropH * aspectRatio;
      }

      const cropX = (canvas.width - cropW) / 2;
      const cropY = (canvas.height - cropH) / 2;

      // Cutout
      ctx.clearRect(cropX, cropY, cropW, cropH);
      ctx.strokeStyle = "rgba(255,165,0,0.9)";
      ctx.lineWidth = 2;
      ctx.shadowBlur = 25;
      ctx.shadowColor = "rgba(255,165,0,0.6)";
      ctx.strokeRect(cropX, cropY, cropW, cropH);
      ctx.shadowBlur = 0;

      requestAnimationFrame(draw);
    }
    draw();
  }, [step, image, zoom, offset, aspectRatio]);

  const handleMouseDownCrop = (e) => {
    setDraggingImage(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMoveCrop = (e) => {
    if (!draggingImage) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUpCrop = () => setDraggingImage(false);

  // Reset with animation
  const handleResetImage = () => {
    const canvas = cropCanvasRef.current;
    canvas.classList.add("image-reset");
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setTimeout(() => canvas.classList.remove("image-reset"), 300);
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="fullscreen-canvas"
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
      />

      {showPopup && step !== "crop" && (
        <div className={`selection-popup ${fadeOut ? "fade-out" : "fade-in"}`}>
          <button className="close-btn" onClick={cancelSelection}>×</button>

          {step === "summary" && selection && (
            <div className="popup-inner fade-in">
              <div className="popup-line">
                {Math.round(selection.width)} × {Math.round(selection.height)} px
              </div>
              <div className="popup-price">€{price.toFixed(2)}</div>
              <div style={{ marginTop: "8px", textAlign: "right" }}>
                <button onClick={handleProceed} className="btn-glass confirm">Buy</button>
              </div>
            </div>
          )}

          {step === "link" && (
            <div className="popup-inner fade-in">
              <div className="popup-line">Add your link (optional)</div>
              <input
                type="text"
                placeholder="https://yourwebsite.com"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                className="glass-input"
              />
              <div style={{ marginTop: "10px", textAlign: "right" }}>
                <button onClick={handleLinkNext} className="btn-glass cancel">Skip</button>
                <button onClick={handleLinkNext} className="btn-glass confirm">Continue</button>
              </div>
            </div>
          )}

          {step === "upload" && (
            <div className="popup-inner fade-in">
              <div className="popup-line">Upload your banner</div>
              <label className="upload-zone">
                <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
                {image ? (
                  <img src={image} alt="preview" className="upload-preview" />
                ) : (
                  "Drag & drop or click to upload"
                )}
              </label>
              <div style={{ marginTop: "10px", textAlign: "right" }}>
                <button onClick={handleContinueToCrop} disabled={!image} className="btn-glass confirm">
                  Continue
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === "crop" && image && (
        <div className="crop-overlay">
          <div className="crop-modal">
            <canvas
              ref={cropCanvasRef}
              width={900}
              height={550}
              className="crop-full-canvas"
              onMouseDown={handleMouseDownCrop}
              onMouseMove={handleMouseMoveCrop}
              onMouseUp={handleMouseUpCrop}
            />

            <div className="crop-controls fade-in">
              <div className="zoom-row">
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.01"
                  value={zoom}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  className="zoom-slider"
                />
                <div className="tooltip-container">
                  <button className="btn-glass reset" onClick={handleResetImage}>⟳</button>
                  <span className="tooltip">Reset image to original position</span>
                </div>
              </div>

              <div className="crop-buttons">
                <button onClick={() => setStep("upload")} className="btn-glass cancel">
                  Back
                </button>
                <button onClick={handleContinuePayment} className="btn-glass confirm">
                  Confirm & Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
