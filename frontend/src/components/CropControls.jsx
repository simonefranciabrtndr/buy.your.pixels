import React from "react";

export default function CropControls({ zoom, setZoom, resetImage, handleBack, handleContinue }) {
  return (
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
          <button className="btn-glass reset" onClick={resetImage}>⟳</button>
          <span className="tooltip">Reset image to original position</span>
        </div>
      </div>

      <div className="crop-buttons">
        <button onClick={handleBack} className="btn-glass cancel">Back</button>
        <button onClick={handleContinue} className="btn-glass confirm">Confirm & Continue</button>
      </div>
    </div>
  );
}
