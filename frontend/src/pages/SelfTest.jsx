import { useEffect, useState } from "react";
import "./SelfTest.css";

function PaypalSummary({ details }) {
  if (!details) return null;
  const config = details.config || {};
  const token = details.token || {};
  const createOrder = details.createOrder || {};
  const sdkUrl = details.sdkUrl || {};
  const capture = details.capture || {};

  return (
    <div className="st-accordion-body">
      <div>config.enabled: {String(config.enabled)}</div>
      <div>token.success: {String(token.success)}</div>
      <div>orderId: {createOrder.orderId || "n/a"}</div>
      <div>sdkUrl.status: {sdkUrl.status ?? "n/a"}</div>
      <div>capture.skipped: {String(capture.skipped)}</div>
    </div>
  );
}

function AccordionItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="st-accordion-item">
      <button className="st-accordion-toggle" onClick={() => setOpen((v) => !v)}>
        <span>{item.name}</span>
        <span className={item.success ? "st-pass" : "st-fail"}>{item.success ? "✓" : "✕"}</span>
      </button>
      {open && (
        <>
          {item.name === "paypal" && <PaypalSummary details={item.details} />}
          <pre className="st-accordion-body">
            {JSON.stringify(
              {
                success: item.success,
                error: item.error,
                duration_ms: item.duration_ms,
                details: item.details,
              },
              null,
              2
            )}
          </pre>
        </>
      )}
      {!item.success && item.error && (
        <pre className="selftest-error-block">{JSON.stringify(item.error, null, 2)}</pre>
      )}
    </div>
  );
}

export default function SelfTest() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadReport = async (forceRun = false) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = forceRun ? "/api/self-test/run" : "/api/self-test/report";
      const res = await fetch(endpoint);
      const data = await res.json();
      setReport(data);
    } catch (err) {
      setError(err?.message || "Failed to load self-test");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport(false);
  }, []);

  const overallPass = report?.success;
  const tests = report?.tests || [];

  return (
    <div className="st-page">
      <div className="st-card">
        <div className="st-status">
          <div className={`st-icon ${overallPass ? "st-icon-pass" : "st-icon-fail"}`}>
            {overallPass ? "✓" : "✕"}
          </div>
          <div>
            <h1>System Self-Test</h1>
            <p>{overallPass ? "All systems green" : "Tests failed or not run yet"}</p>
          </div>
        </div>
        <div className="st-actions">
          <button className="st-btn" disabled={loading} onClick={() => loadReport(true)}>
            {loading ? "Running..." : "Run tests"}
          </button>
          <button className="st-btn ghost" disabled={loading} onClick={() => loadReport(false)}>
            Refresh last report
          </button>
        </div>
        {report?.startedAt && (
          <div className="st-meta">Last run: {new Date(report.startedAt).toLocaleString()}</div>
        )}
        {error && <div className="st-error">{error}</div>}
        <div className="st-accordion">
          {tests.map((t) => (
            <AccordionItem key={t.name} item={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
