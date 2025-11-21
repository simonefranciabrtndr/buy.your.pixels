import React, {
  useState,
  useEffect,
  useRef,
  useLayoutEffect,
  useCallback,
} from "react";
import CanvasOverlay from "./CanvasOverlay";
import PaymentStep from "./payment/PaymentStep";
import "./SelectionPopup.css";

let isEditMode = false;

const formatLinkHostname = (url) => {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
};

const truncateText = (value, maxLength) => {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1))}…`;
};

const DEFAULT_TRANSFORM = { x: 0, y: 0, width: 1, height: 1 };
const SAFE_MARGIN = 24;

/**
 * SelectionPopup
 *
 * This component drives the buying flow for a selected region on the canvas.
 * It offers multiple steps: summary, upload, link, editing, final and payment.
 *
 * Requirements from the user:
 * 1. When the selected region lies on the right half of the screen, the popup should
 *    appear on the left side of the viewport; otherwise it appears on the right.
 * 2. After clicking the preview button (now labelled "Edit"), an editing interface
 *    appears where the user can drag and resize the uploaded image inside a
 *    miniature preview proportional to the selected pixel area. Buttons to stop
 *    or finish editing return to the final step with the pay button.
 */
export default function SelectionPopup({
  area,
  price,
  onClose,
  onFinalizePurchase,
  mode = "purchase",
  initialValues = {},
  onFinalizeEdit,
}) {
  const isEditMode = mode === "edit";
  // step machine: summary → upload → link → final → editing
  const [step, setStep] = useState(isEditMode ? "upload" : "summary");
  const [uploadedImage, setUploadedImage] = useState(null);
  const [link, setLink] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [imageTransform, setImageTransform] = useState(() => ({ ...DEFAULT_TRANSFORM }));
  const [isNsfw, setIsNsfw] = useState(false);

  // Editing state: stores the current position and size of the image inside the miniature
  const [editPosition, setEditPosition] = useState({ x: 0, y: 0 });
  const [editSize, setEditSize] = useState({ width: 0, height: 0 });
  const [previewDims, setPreviewDims] = useState({ width: 0, height: 0, scale: 1 });
  const [linkPreviewData, setLinkPreviewData] = useState(null);
  const [linkPreviewStatus, setLinkPreviewStatus] = useState("idle");

  // refs to track drag and resize starts
  const popupRef = useRef(null);
  const dragStartRef = useRef(null);
  const resizeStartRef = useRef(null);
  const linkPreviewCacheRef = useRef(new Map());
  const linkPreviewControllerRef = useRef(null);

  const [popupPosition, setPopupPosition] = useState({ top: SAFE_MARGIN, left: SAFE_MARGIN });
  const [popupPlacement, setPopupPlacement] = useState("top-left");

  const bounds = area?.rect || null;
  const areaTiles = area?.tiles && area.tiles.length ? area.tiles : bounds ? [bounds] : [];
  const totalAreaPixels = area?.area ?? (bounds ? bounds.w * bounds.h : 0);
  const boundingWidth = bounds ? Math.round(bounds.w) : 0;
  const boundingHeight = bounds ? Math.round(bounds.h) : 0;
  const formattedPixels = Math.round(totalAreaPixels).toLocaleString();

  /**
   * Determine a placement for the popup that keeps it off the selected region
   * while preferring the side with more free space. Falls back to positioning
   * above/below if the selection spans the viewport width.
   */
  const updatePopupPosition = useCallback(() => {
    if (!popupRef.current || !bounds || typeof window === "undefined") return;

    const popupElement = popupRef.current;
    const popupWidth = popupElement.offsetWidth;
    const popupHeight = popupElement.offsetHeight;
    if (!popupWidth || !popupHeight) return;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = SAFE_MARGIN;

    const minLeft = margin;
    const maxLeft = Math.max(minLeft, viewportWidth - popupWidth - margin);
    const minTop = margin;
    const maxTop = Math.max(minTop, viewportHeight - popupHeight - margin);

    const cornerPositions = {
      "top-left": { top: minTop, left: minLeft },
      "top-right": { top: minTop, left: maxLeft },
      "bottom-left": { top: maxTop, left: minLeft },
      "bottom-right": { top: maxTop, left: maxLeft },
    };

    const selectionCenterX = bounds.x + bounds.w / 2;
    const selectionCenterY = bounds.y + bounds.h / 2;
    const preferVertical = selectionCenterY > viewportHeight / 2 ? "top" : "bottom";
    const preferHorizontal = selectionCenterX > viewportWidth / 2 ? "left" : "right";

    const orderedCorners = [
      `${preferVertical}-${preferHorizontal}`,
      `${preferVertical}-${preferHorizontal === "left" ? "right" : "left"}`,
      `${preferVertical === "top" ? "bottom" : "top"}-${preferHorizontal}`,
      `${preferVertical === "top" ? "bottom" : "top"}-${preferHorizontal === "left" ? "right" : "left"}`,
    ].filter((corner, index, arr) => arr.indexOf(corner) === index);

    const expandedRect = {
      x: bounds.x - margin,
      y: bounds.y - margin,
      w: bounds.w + margin * 2,
      h: bounds.h + margin * 2,
    };

    const overlapAreaForCorner = (cornerKey) => {
      const candidate = cornerPositions[cornerKey];
      if (!candidate) return Number.POSITIVE_INFINITY;
      const popupRect = {
        x: candidate.left,
        y: candidate.top,
        w: popupWidth,
        h: popupHeight,
      };
      const overlapWidth = Math.max(
        0,
        Math.min(popupRect.x + popupRect.w, expandedRect.x + expandedRect.w) -
          Math.max(popupRect.x, expandedRect.x)
      );
      const overlapHeight = Math.max(
        0,
        Math.min(popupRect.y + popupRect.h, expandedRect.y + expandedRect.h) -
          Math.max(popupRect.y, expandedRect.y)
      );
      return overlapWidth * overlapHeight;
    };

    let chosenCorner =
      orderedCorners.find((cornerKey) => overlapAreaForCorner(cornerKey) === 0) ||
      orderedCorners.reduce(
        (best, cornerKey) => {
          const area = overlapAreaForCorner(cornerKey);
          if (area < best.area) {
            return { corner: cornerKey, area };
          }
          return best;
        },
        { corner: orderedCorners[0] ?? "top-right", area: overlapAreaForCorner(orderedCorners[0] ?? "top-right") }
      ).corner;

    if (!cornerPositions[chosenCorner]) {
      chosenCorner = "top-right";
    }

    let { top, left } = cornerPositions[chosenCorner];

    // calcola la dimensione massima
    let nextWidth = popupWidth;
    let nextHeight = popupHeight;

    if (step === "payment") {
      popupElement.style.maxWidth = "";
      popupElement.style.maxHeight = "";
      popupElement.style.overflow = "auto";
      nextWidth = Math.min(popupElement.offsetWidth, viewportWidth - margin * 2);
      nextHeight = Math.min(popupElement.offsetHeight, viewportHeight - margin * 2);
    } else {
      const clampedWidth = Math.min(popupWidth, viewportWidth - margin * 2);
      const clampedHeight = Math.min(popupHeight, viewportHeight - margin * 2);
      popupElement.style.maxWidth = `${clampedWidth}px`;
      popupElement.style.maxHeight = `${clampedHeight}px`;
      popupElement.style.overflow = "auto";
      nextWidth = clampedWidth;
      nextHeight = clampedHeight;
    }

    left = Math.min(Math.max(left, margin), viewportWidth - nextWidth - margin);
    top = Math.min(Math.max(top, margin), viewportHeight - nextHeight - margin);

    setPopupPosition((prev) => {
      if (prev && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.left - left) < 0.5) {
        return prev;
      }
      return { top, left };
    });
    setPopupPlacement((prev) => (prev === chosenCorner ? prev : chosenCorner));
  }, [bounds, step]);

  useLayoutEffect(() => {
    updatePopupPosition();
  }, [updatePopupPosition, bounds, step, uploadedImage, showPreview, link]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => updatePopupPosition();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updatePopupPosition]);

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    if (!popupRef.current) return undefined;
    const observer = new ResizeObserver(() => {
      updatePopupPosition();
    });
    observer.observe(popupRef.current);
    return () => observer.disconnect();
  }, [updatePopupPosition, popupRef]);

  useEffect(
    () => () => {
      if (linkPreviewControllerRef.current) {
        linkPreviewControllerRef.current.abort();
        linkPreviewControllerRef.current = null;
      }
    },
    []
  );


  const popupStyle = popupPosition
    ? {
        top: `${popupPosition.top}px`,
        left: `${popupPosition.left}px`,
      }
    : {};
  const popupClassName = `selection-popup glassy corner-${popupPlacement}${step === "payment" ? " payment-mode" : ""}`;
  const isBottomPlacement = popupPlacement.startsWith("bottom");

  const resetFlowState = useCallback(() => {
    setStep("summary");
    setUploadedImage(null);
    setLink("");
    setShowPreview(false);
    setIsDragging(false);
    setImageTransform({ ...DEFAULT_TRANSFORM });
    setEditPosition({ x: 0, y: 0 });
    setEditSize({ width: 0, height: 0 });
    setPreviewDims({ width: 0, height: 0, scale: 1 });
    setIsNsfw(false);
    setLinkPreviewData(null);
    setLinkPreviewStatus("idle");
    if (linkPreviewControllerRef.current) {
      linkPreviewControllerRef.current.abort();
      linkPreviewControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    resetFlowState();
  }, [area, resetFlowState]);

  useEffect(() => {
    setStep(isEditMode ? "upload" : "summary");
  }, [isEditMode, bounds?.x, bounds?.y]);

  useEffect(() => {
    if (!isEditMode) return;
    setUploadedImage(initialValues.uploadedImage || null);
    setLink(initialValues.link || "");
    setIsNsfw(Boolean(initialValues.isNsfw));
    setImageTransform(initialValues.imageTransform || DEFAULT_TRANSFORM);
  }, [isEditMode, initialValues]);

  const handleClose = useCallback(() => {
    resetFlowState();
    onClose();
  }, [onClose, resetFlowState]);

  /** Handle file upload and store as base64 string. */
  const readFile = (file) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setUploadedImage(event.target.result);
        setImageTransform({ ...DEFAULT_TRANSFORM });
        setShowPreview(true);
      };
      reader.readAsDataURL(file);
    }
  };
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    readFile(file);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    readFile(file);
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!isDragging) setIsDragging(true);
  };
  const handleDragLeave = (e) => {
    e.preventDefault();
    if (e.target === e.currentTarget) {
      setIsDragging(false);
    }
  };

  /**
   * When entering editing mode, calculate the dimensions of the miniature preview.
   * The miniature maintains the aspect ratio of the selected region and fits within
   * a maximum bounding box. Initialise the image size and position with the stored transform.
   */
  useEffect(() => {
    if (step !== "editing" || !bounds || !uploadedImage) return;
    const MAX_PREVIEW_WIDTH = 350;
    const MAX_PREVIEW_HEIGHT = 300;
    const ratio = Math.min(
      MAX_PREVIEW_WIDTH / bounds.w,
      MAX_PREVIEW_HEIGHT / bounds.h
    );
    const width = bounds.w * ratio;
    const height = bounds.h * ratio;
    setPreviewDims({ width, height, scale: ratio });
    const baseTransform = imageTransform || DEFAULT_TRANSFORM;
    setEditSize({
      width: width * baseTransform.width,
      height: height * baseTransform.height,
    });
    setEditPosition({
      x: width * baseTransform.x,
      y: height * baseTransform.y,
    });
  }, [step, bounds, uploadedImage, imageTransform]);

  /**
   * Register global mousemove and mouseup handlers when editing to enable dragging
   * and resizing. Clean them up when leaving editing mode.
   */
  useEffect(() => {
    if (step !== "editing") return;
    const handleMouseMove = (e) => {
      if (dragStartRef.current) {
        const { startX, startY, initX, initY } = dragStartRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        setEditPosition({ x: initX + dx, y: initY + dy });
      }
      if (resizeStartRef.current) {
        const { startX, startY, initW, initH } = resizeStartRef.current;
        const dw = e.clientX - startX;
        const dh = e.clientY - startY;
        const newWidth = Math.max(20, initW + dw);
        const newHeight = Math.max(20, initH + dh);
        setEditSize({ width: newWidth, height: newHeight });
      }
    };
    const handleMouseUp = () => {
      dragStartRef.current = null;
      resizeStartRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [step]);

  useEffect(() => {
    const trimmedLink = (link || "").trim();

    if (!trimmedLink) {
      setLinkPreviewData(null);
      setLinkPreviewStatus("idle");
      return;
    }

    if (!/^https?:\/\/.+/i.test(trimmedLink) || !trimmedLink.includes(".")) {
      setLinkPreviewData(null);
      setLinkPreviewStatus("invalid");
      return;
    }

    if (linkPreviewCacheRef.current.has(trimmedLink)) {
      const cached = linkPreviewCacheRef.current.get(trimmedLink);
      if (cached) {
        setLinkPreviewData(cached);
        setLinkPreviewStatus("success");
      } else {
        setLinkPreviewData(null);
        setLinkPreviewStatus("error");
      }
      return;
    }

    const controller = new AbortController();
    linkPreviewControllerRef.current = controller;
    setLinkPreviewData(null);
    setLinkPreviewStatus("loading");
    let didCancel = false;
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(trimmedLink)}&screenshot=true&palette=true&meta=false`,
      { signal: controller.signal }
    )
      .then((response) => {
        if (!response.ok) throw new Error("Preview request failed");
        return response.json();
      })
      .then((json) => {
        if (didCancel) return;
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
        linkPreviewCacheRef.current.set(trimmedLink, preview);
        setLinkPreviewData(preview);
        setLinkPreviewStatus("success");
      })
      .catch((error) => {
        if (didCancel || error.name === "AbortError") return;
        console.warn("Unable to fetch link preview", error);
        linkPreviewCacheRef.current.set(trimmedLink, null);
        setLinkPreviewData(null);
        setLinkPreviewStatus("error");
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (linkPreviewControllerRef.current === controller) {
          linkPreviewControllerRef.current = null;
        }
      });

    return () => {
      didCancel = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [link]);

  const hasPreviewBox = previewDims.width > 0 && previewDims.height > 0;
  const normalizedEditTransform = hasPreviewBox
    ? {
        x: editPosition.x / previewDims.width,
        y: editPosition.y / previewDims.height,
        width: editSize.width / previewDims.width,
        height: editSize.height / previewDims.height,
      }
    : imageTransform || DEFAULT_TRANSFORM;

  if (!bounds || !areaTiles.length) {
    return null;
  }

  const trimmedLink = (link || "").trim();

  const buildFinalizePayload = () => ({
    rect: bounds,
    tiles: areaTiles,
    area: totalAreaPixels,
    link: trimmedLink,
    price,
    uploadedImage,
    imageTransform,
    nsfw: isNsfw,
    previewData: linkPreviewStatus === "success" ? linkPreviewData : null,
  });

  const handlePaymentSuccess = (paymentInfo) => {
    if (onFinalizePurchase) {
      onFinalizePurchase({
        ...buildFinalizePayload(),
        payment: paymentInfo,
      });
    }
    handleClose();
  };

  const handleEditSave = () => {
    if (onFinalizeEdit) {
      onFinalizeEdit({
        ...buildFinalizePayload(),
        purchaseId: initialValues.id,
      });
    }
    handleClose();
  };

  /** Render summary step */
  if (step === "summary") {
    if (isEditMode) {
      return (
        <div className={popupClassName} ref={popupRef} style={popupStyle}>
          <button className="close-btn" onClick={handleClose}>×</button>
          <div className="popup-body">
            <h3>Edit your banner</h3>
            <p className="final-text">Reload the uploader to replace the image or adjust the link.</p>
            <button className="popup-continue" onClick={() => setStep("upload")}>
              Start editing
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className={popupClassName} ref={popupRef} style={popupStyle}>
        <button className="close-btn" onClick={handleClose}>×</button>
        <div className="popup-body">
          <h3>Selection summary</h3>
          <div className="popup-size">
            Bounding box: {boundingWidth} × {boundingHeight} px
          </div>
          <div className="popup-area">
            Available pixels: {formattedPixels}
          </div>
          <div className="popup-price">€{price}</div>
          <button className="popup-buy" onClick={() => setStep("upload")}>Buy</button>
        </div>
      </div>
    );
  }

  /** Render upload step */
  if (step === "upload") {
    return (
      <div className={popupClassName} ref={popupRef} style={popupStyle}>
        <button className="close-btn" onClick={handleClose}>×</button>
        <div className="popup-body">
          <h3>Upload your banner</h3>
          <label
            className={`upload-zone${isDragging ? " dragging" : ""}`}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {uploadedImage ? (
              <img src={uploadedImage} alt="Uploaded banner" className="uploaded-preview" />
            ) : (
              <>
                Drag & drop or click to upload
                <input type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
              </>
            )}
          </label>
          <button
            className="popup-continue"
            disabled={!uploadedImage}
            onClick={() => setStep("link")}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  /** Render link step */
  if (step === "link") {
    return (
      <div className={popupClassName} ref={popupRef} style={popupStyle}>
        <button className="close-btn" onClick={handleClose}>×</button>
        <div className="popup-body link-step">
          <h3>Add your link</h3>
          <div className="link-input-card">
            <label className="link-input-label" htmlFor="popup-link-input">
              Destination URL
            </label>
            <div className="link-input-field">
              <input
                id="popup-link-input"
                type="text"
                className="popup-input"
                placeholder="https://yourwebsite.com"
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
            </div>
            <span className="link-input-hint">Paste the full URL visitors will reach.</span>
          </div>
          <div className={`nsfw-toggle-card${isNsfw ? " active" : ""}`}>
            <div className="nsfw-text">
              <span className="nsfw-title">NSFW</span>
              <span className="nsfw-sub">Blur preview for sensitive content</span>
            </div>
            <button
              type="button"
              className={`nsfw-toggle${isNsfw ? " active" : ""}`}
              onClick={() => setIsNsfw((prev) => !prev)}
              aria-pressed={isNsfw}
            >
              <span className="nsfw-toggle-slider" />
            </button>
          </div>
          <div className="popup-buttons link-buttons">
            <button className="popup-skip" onClick={() => setStep("final")}>Skip</button>
            <button
              className="popup-continue"
              onClick={() => {
                if (link && !link.startsWith("http")) {
                  alert("Link must start with http or https");
                  return;
                }
                setStep("final");
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  /** Render editing step: drag & resize inside a miniature */
  if (step === "editing") {
    const editingButtons = (
      <div className="popup-buttons" style={{ marginTop: "20px" }}>
        <button
          className="popup-skip"
          onClick={() => {
            setStep("final");
          }}
        >
          Stop Editing
        </button>
        <button
          className="popup-continue"
          onClick={() => {
            if (!hasPreviewBox) {
              setStep("final");
              return;
            }
            setImageTransform({
              x: editPosition.x / previewDims.width,
              y: editPosition.y / previewDims.height,
              width: editSize.width / previewDims.width,
              height: editSize.height / previewDims.height,
            });
            setShowPreview(true);
            setStep("final");
          }}
        >
          Done Editing
        </button>
      </div>
    );

    return (
      <>
        <CanvasOverlay area={area} imageSrc={uploadedImage} transform={normalizedEditTransform} />
        <div className={popupClassName} ref={popupRef} style={popupStyle}>
          <button className="close-btn" onClick={handleClose}>×</button>
          <div className="popup-body">
            <h3>Edit your image</h3>
            {isBottomPlacement && editingButtons}
            <div
              style={{
                width: `${previewDims.width}px`,
                height: `${previewDims.height}px`,
                border: "2px dashed rgba(255,255,255,0.4)",
                borderRadius: "10px",
                margin: "0 auto",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {uploadedImage && (
                <>
                  <img
                    src={uploadedImage}
                    alt="Editable"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      dragStartRef.current = {
                        startX: e.clientX,
                        startY: e.clientY,
                        initX: editPosition.x,
                        initY: editPosition.y,
                      };
                    }}
                    style={{
                      position: "absolute",
                      left: `${editPosition.x}px`,
                      top: `${editPosition.y}px`,
                      width: `${editSize.width}px`,
                      height: `${editSize.height}px`,
                      cursor: "move",
                      userSelect: "none",
                    }}
                  />
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      resizeStartRef.current = {
                        startX: e.clientX,
                        startY: e.clientY,
                        initW: editSize.width,
                        initH: editSize.height,
                      };
                    }}
                    style={{
                      position: "absolute",
                      right: 0,
                      bottom: 0,
                      width: "16px",
                      height: "16px",
                      background: "rgba(255,255,255,0.8)",
                      cursor: "nwse-resize",
                      borderTopLeftRadius: "4px",
                    }}
                  ></div>
                </>
              )}
            </div>
            {!isBottomPlacement && editingButtons}
          </div>
        </div>
      </>
    );
  }

  /** Render final step: overlay preview, edit and pay */
  if (step === "final") {
    const previewAccentStyle = linkPreviewData?.accent
      ? {
          borderColor: linkPreviewData.accent,
          boxShadow: `0 18px 32px rgba(0,0,0,0.4), 0 0 26px ${linkPreviewData.accent}`,
        }
      : undefined;
    const finalButtons = (
      <div className="popup-buttons">
        <button
          className="popup-skip"
          onClick={() => setShowPreview(!showPreview)}
        >
          {showPreview ? "Hide Preview" : "Preview"}
        </button>
        <button
          className="popup-skip"
          onClick={() => setStep("editing")}
        >
          Edit
        </button>
        {isEditMode ? (
          <button className="popup-continue" onClick={handleEditSave}>
            Save changes
          </button>
        ) : (
          <button className="popup-continue" onClick={() => setStep("payment")}>
            Pay
          </button>
        )}
      </div>
    );

    return (
      <>
        <CanvasOverlay area={area} imageSrc={showPreview ? uploadedImage : null} transform={imageTransform} />
        <div className={popupClassName} ref={popupRef} style={popupStyle}>
          <button className="close-btn" onClick={handleClose}>×</button>
          <div className="popup-body">
            <h3>Finalize your banner</h3>
            {isBottomPlacement && finalButtons}
            <p className="final-text">You can edit your banner or proceed to payment.</p>
            {trimmedLink && (
              <div className="popup-link-preview">
                {linkPreviewStatus === "loading" && (
                  <div className="popup-preview-hint">Loading live preview…</div>
                )}
                {linkPreviewStatus === "error" && (
                  <div className="popup-preview-hint error">
                    We couldn't load a preview, but the link will still work.
                  </div>
                )}
                {linkPreviewStatus === "invalid" && (
                  <div className="popup-preview-hint error">
                    Add a valid link starting with http:// or https:// to generate a preview.
                  </div>
                )}
                {linkPreviewStatus === "success" && (
                  <div className="popup-preview-card" style={previewAccentStyle}>
                    {linkPreviewData?.image ? (
                      <div className="popup-preview-thumb">
                        <img
                          src={linkPreviewData.image}
                          alt="Link preview"
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <div className="popup-preview-thumb placeholder">
                        {linkPreviewData?.logo ? (
                          <img
                            src={linkPreviewData.logo}
                            alt="Link icon"
                            draggable={false}
                          />
                        ) : (
                          <span>Link</span>
                        )}
                      </div>
                    )}
                    <div className="popup-preview-domain">{formatLinkHostname(trimmedLink)}</div>
                    <div className="popup-preview-title">
                      {linkPreviewData?.title
                        ? truncateText(linkPreviewData.title, 120)
                        : truncateText(trimmedLink, 120)}
                    </div>
                    {linkPreviewData?.description && (
                      <div className="popup-preview-description">
                        {truncateText(linkPreviewData.description, 120)}
                      </div>
                    )}
                    <div className="popup-preview-open-hint">
                      Visitors will see this preview when hovering your banner.
                    </div>
                  </div>
                )}
              </div>
            )}
            {!isBottomPlacement && finalButtons}
          </div>
        </div>
      </>
    );
  }

  if (!isEditMode && step === "payment") {
    return (
      <>
        <CanvasOverlay area={area} imageSrc={showPreview ? uploadedImage : null} transform={imageTransform} />
        <div className={popupClassName} ref={popupRef} style={popupStyle}>
          <button className="close-btn" onClick={handleClose}>×</button>
          <div className="popup-body">
            <PaymentStep
              area={area}
              price={price}
              onBack={() => setStep("final")}
              onCancel={handleClose}
              onSuccess={handlePaymentSuccess}
            />
          </div>
        </div>
      </>
    );
}

  return null;
}
