import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

export default function SocialLogin() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {
      setStatus("error");
      setMessage("Missing authentication token.");
      return;
    }

    try {
      window.localStorage.setItem("authToken", token);
      window.dispatchEvent(new CustomEvent("auth-updated"));
      const timeout = setTimeout(() => {
        navigate("/", { replace: true });
      }, 800);
      return () => clearTimeout(timeout);
    } catch (error) {
      console.error("Failed to finalize social login", error);
      setStatus("error");
      setMessage("Unable to store session.");
    }
  }, [navigate]);

  const goHome = () => navigate("/", { replace: true });

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "18px",
        background: "#05070f",
        color: "white",
        fontFamily: '"SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif',
        textAlign: "center",
        padding: "24px",
      }}
    >
      {status === "loading" ? (
        <>
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "50%",
              border: "4px solid rgba(255,255,255,0.2)",
              borderTopColor: "#fff",
              animation: "spin 1s linear infinite",
            }}
          />
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <p>{message}</p>
        </>
      ) : (
        <>
          <p>{message}</p>
          <button
            onClick={goHome}
            style={{
              border: "none",
              borderRadius: "12px",
              padding: "12px 24px",
              background: "rgba(255,255,255,0.1)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Return to homepage
          </button>
        </>
      )}
    </div>
  );
}
