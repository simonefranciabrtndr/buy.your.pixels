import { useEffect, useMemo, useState } from "react";

const truncate = (value = "", max = 200) => {
  if (typeof value !== "string") return value;
  return value.length > max ? `${value.slice(0, max)}…` : value;
};

const providerBadge = (provider) => {
  if (provider === "stripe") return <span className="badge badge-stripe">Stripe</span>;
  if (provider === "paypal") return <span className="badge badge-paypal">PayPal</span>;
  return <span className="badge badge-unknown">Unknown</span>;
};

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [noKey, setNoKey] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!import.meta.env.VITE_ADMIN_API_KEY) {
        setNoKey(true);
        return;
      }
      setLoading(true);
      setError(null);
      let attempts = 0;
      try {
        while (attempts < 2) {
          attempts += 1;
          const res = await fetch("/api/admin/orders", {
            headers: {
              "x-admin-key": import.meta.env.VITE_ADMIN_API_KEY || "",
            },
          });
          if (res.ok) {
            const data = await res.json();
            setOrders(Array.isArray(data?.orders) ? data.orders : []);
            return;
          }
          if (attempts >= 2) {
            const text = await res.text();
            throw new Error(text || `Request failed ${res.status}`);
          }
        }
      } catch (err) {
        setError(err?.message || "Failed to load orders");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const stats = useMemo(() => {
    const total = orders.length;
    const revenue = orders.reduce((sum, o) => sum + Number(o.price || 0), 0);
    const stripeCount = orders.filter((o) => o.provider === "stripe").length;
    const paypalCount = orders.filter((o) => o.provider === "paypal").length;
    const unknownCount = total - stripeCount - paypalCount;
    return { total, revenue, stripeCount, paypalCount, unknownCount };
  }, [orders]);

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-header">
          <div>
            <h1>Orders Dashboard</h1>
            <p>Latest 200 purchases (Stripe + PayPal)</p>
          </div>
          {loading && <div className="payment-loader">Loading…</div>}
        </div>

        {error && <div className="payment-error">{error}</div>}

        <div className="admin-stats">
          {noKey && <div className="payment-error">Admin key missing; set VITE_ADMIN_API_KEY.</div>}
          <div>
            <span className="stat-label">Total</span>
            <strong>{stats.total}</strong>
          </div>
          <div>
            <span className="stat-label">Revenue (EUR)</span>
            <strong>€ {stats.revenue.toFixed(2)}</strong>
          </div>
          <div>
            <span className="stat-label">Stripe</span>
            <strong>{stats.stripeCount}</strong>
          </div>
          <div>
            <span className="stat-label">PayPal</span>
            <strong>{stats.paypalCount}</strong>
          </div>
          <div>
            <span className="stat-label">Unknown</span>
            <strong>{stats.unknownCount}</strong>
          </div>
        </div>

        <div className="admin-table">
          <div className="admin-table-head">
            <span>Date</span>
            <span>Order ID</span>
            <span>Provider</span>
            <span>Amount</span>
            <span>Area</span>
            <span>Link</span>
            <span>Payment ID</span>
          </div>
          <div className="admin-table-body">
            {orders.map((order) => {
              const isOpen = expandedId === order.id;
              const dateStr = order.createdAt ? new Date(order.createdAt).toLocaleString() : "—";
              const shortLink =
                order.link && order.link.length > 40 ? `${order.link.slice(0, 40)}…` : order.link || "—";
              return (
                <div key={order.id} className="admin-row">
                  <button className="admin-row-main" onClick={() => setExpandedId(isOpen ? null : order.id)}>
                    <span>{dateStr}</span>
                    <span title={order.id}>{order.id}</span>
                    <span>{providerBadge(order.provider)}</span>
                    <span>€ {Number(order.price || 0).toFixed(2)}</span>
                    <span>{order.area || 0}</span>
                    <span title={order.link || ""}>{shortLink}</span>
                    <span title={order.paymentId || ""}>{order.paymentId || "—"}</span>
                  </button>
                  {isOpen && (
                    <div className="admin-row-detail">
                      <pre>
                        {JSON.stringify(
                          Object.fromEntries(
                            Object.entries(order).map(([k, v]) => [
                              k,
                              typeof v === "string" ? truncate(v, 200) : v,
                            ])
                          ),
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
            {!orders.length && !loading && <div className="payment-loader">No orders to display.</div>}
          </div>
        </div>
      </div>

      <style>{`
        .admin-page { min-height: 100vh; padding: 32px; background: radial-gradient(circle at 20% 20%, rgba(79,157,255,0.12), rgba(5,8,22,0.95)), #050816; color: #eaf2ff; }
        .admin-card { max-width: 1100px; margin: 0 auto; background: rgba(15,18,32,0.85); border:1px solid rgba(255,255,255,0.08); border-radius: 18px; padding: 20px; box-shadow: 0 18px 40px rgba(0,0,0,0.35); }
        .admin-header { display:flex; align-items:center; justify-content:space-between; margin-bottom: 16px; }
        .admin-stats { display:grid; grid-template-columns: repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-bottom: 16px; }
        .admin-stats div { background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 10px 12px; }
        .stat-label { display:block; font-size:11px; opacity:0.65; letter-spacing:0.06em; text-transform:uppercase; margin-bottom:4px; }
        .admin-table { border:1px solid rgba(255,255,255,0.08); border-radius: 12px; overflow:hidden; background: rgba(255,255,255,0.02); }
        .admin-table-head, .admin-row-main { display:grid; grid-template-columns: 1.3fr 1.2fr 0.8fr 0.8fr 0.6fr 1.4fr 1.4fr; gap:8px; align-items:center; }
        .admin-table-head { padding:10px 12px; background: rgba(255,255,255,0.04); font-size:12px; letter-spacing:0.05em; text-transform:uppercase; }
        .admin-table-body { display:flex; flex-direction:column; }
        .admin-row { border-top:1px solid rgba(255,255,255,0.05); }
        .admin-row-main { width:100%; text-align:left; padding:10px 12px; background:transparent; color:inherit; border:none; cursor:pointer; }
        .admin-row-main:hover { background: rgba(255,255,255,0.04); }
        .admin-row-detail { padding:10px 12px; background: rgba(0,0,0,0.35); border-top:1px solid rgba(255,255,255,0.05); }
        .admin-row-detail pre { margin:0; font-size:12px; white-space:pre-wrap; word-break:break-word; }
        .badge { display:inline-block; padding:4px 8px; border-radius:8px; font-size:12px; color:#fff; }
        .badge-stripe { background: linear-gradient(135deg, #635bff, #3a30ff); }
        .badge-paypal { background: linear-gradient(135deg, #003087, #009cde); }
        .badge-unknown { background: rgba(255,255,255,0.16); }
        @media (max-width: 900px) { .admin-table-head, .admin-row-main { grid-template-columns: repeat(2, minmax(0,1fr)); } }
      `}</style>
    </div>
  );
}
