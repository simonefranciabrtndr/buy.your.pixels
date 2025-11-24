import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

export default function AuthSocialRedirect() {
  const { handleSocialRedirect } = useAuth();

  useEffect(() => {
    let mounted = true;
    (async () => {
      await handleSocialRedirect();
      if (mounted) {
        window.location.replace("/");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [handleSocialRedirect]);

  return (
    <div className="auth-social-redirect">
      <style>{`
        .auth-social-redirect {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          background: radial-gradient(circle at top, rgba(37,99,235,0.15), rgba(0,0,0,0.85));
          color: #fff;
          font-family: "SF Pro Display",-apple-system,BlinkMacSystemFont,sans-serif;
        }
        .auth-social-spinner {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 4px solid rgba(255,255,255,0.2);
          border-top-color: #fff;
          animation: authSpin 1s linear infinite;
        }
        @keyframes authSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div className="auth-social-spinner" />
      <p>Loading…</p>
    </div>
  );
}
