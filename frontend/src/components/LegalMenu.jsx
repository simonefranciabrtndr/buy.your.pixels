import React, { useEffect, useMemo, useRef, useState } from "react";
import "./LegalMenu.css";

export default function LegalMenu({
  isOpen,
  onClose,
  documents = [],
  panelId = "legalMenuPanel",
  stats = {},
  onRequestProfile,
}) {
  const [activeId, setActiveId] = useState(() => documents[0]?.id ?? null);
  const firstButtonRef = useRef(null);

  const activeDoc = useMemo(() => {
    if (!documents.length) return null;
    return documents.find((doc) => doc.id === activeId) ?? documents[0];
  }, [activeId, documents]);

  const numberFormatter = useMemo(() => new Intl.NumberFormat("en-US"), []);
  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    []
  );

  const formatValue = (value, suffix = "") => {
    const numeric = Math.max(0, Math.round(value || 0));
    const formatted = numberFormatter.format(numeric);
    return suffix ? `${formatted}${suffix}` : formatted;
  };

  const formatCurrency = (value = 0) => {
    const safeNumber = Number.isFinite(value) ? value : 0;
    return currencyFormatter.format(Math.max(0, safeNumber));
  };

  const summaryMetrics = useMemo(
    () => [
      {
        id: "totalPixels",
        label: "Total number of pixels",
        value: formatValue(stats.totalPixels, " px"),
      },
      {
        id: "purchasedPixels",
        label: "Pixels purchased so far",
        value: formatValue(stats.purchasedPixels, " px"),
      },
      {
        id: "availablePixels",
        label: "Pixels still available",
        value: formatValue(stats.availablePixels, " px"),
      },
      {
        id: "onlineUsers",
        label: "Users currently online",
        value: formatValue(stats.onlineUsers),
      },
      {
        id: "activeSelections",
        label: "Users selecting right now",
        value: formatValue(stats.activeSelections),
      },
      {
        id: "currentSelectionPixels",
        label: "Pixels being selected right now",
        value: formatValue(stats.currentSelectionPixels, " px"),
      },
      {
        id: "charityDonations",
        label: "Donated to charity (0.5%)",
        value: formatCurrency(stats.donationEuros),
      },
      {
        id: "profileManager",
        label: "Manage your pixels",
        value: "Create profile",
        isAction: true,
      },
    ],
    [stats, numberFormatter, currencyFormatter]
  );

  useEffect(() => {
    if (!isOpen || !documents.length) return;
    if (!documents.some((doc) => doc.id === activeId)) {
      setActiveId(documents[0].id);
    }
    const timer = setTimeout(() => {
      firstButtonRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, documents, activeId]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="legal-menu-overlay" role="dialog" aria-modal="true" aria-labelledby="legalMenuTitle">
      <div className="legal-menu-panel glassy" id={panelId}>
        <header className="legal-menu-header">
          <div>
            <p className="legal-menu-kicker">Legal Documentation</p>
            <h2 id="legalMenuTitle">{activeDoc?.title ?? "Documents"}</h2>
            <p className="legal-menu-subtitle">
              Access all terms, privacy and policy details in one place.
            </p>
          </div>
          <button
            type="button"
            className="legal-close-btn"
            onClick={onClose}
            aria-label="Close legal documents"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="legal-stats-grid">
          {summaryMetrics.map((metric) => {
            const isAction = metric.isAction;
            const CardTag = isAction ? "button" : "article";
            const cardProps = isAction
              ? {
                  type: "button",
                  onClick: () => onRequestProfile?.(),
                }
              : {};
            return (
              <CardTag
                key={metric.id}
                className={`legal-stat-card${isAction ? " legal-stat-card--action" : ""}`}
                {...cardProps}
              >
                <p className="legal-stat-label">{metric.label}</p>
                <p className="legal-stat-value">{metric.value}</p>
              </CardTag>
            );
          })}
        </div>

        <div className="legal-menu-body">
          <nav className="legal-doc-list" aria-label="Select a legal document">
            {documents.map((doc, index) => (
              <button
                key={doc.id}
                type="button"
                className={`legal-doc-button${doc.id === (activeDoc?.id ?? "") ? " active" : ""}`}
                onClick={() => setActiveId(doc.id)}
                aria-pressed={doc.id === (activeDoc?.id ?? "")}
                ref={index === 0 ? firstButtonRef : null}
              >
                <span className="legal-doc-title">{doc.title}</span>
                <span className="legal-doc-subtitle">{doc.subtitle}</span>
              </button>
            ))}
          </nav>
          <section
            className="legal-doc-content"
            aria-live="polite"
            aria-label="Selected document content"
          >
            <div
              className="legal-doc-scroll"
              dangerouslySetInnerHTML={{ __html: activeDoc?.content ?? "" }}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
