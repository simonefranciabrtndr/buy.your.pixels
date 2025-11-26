import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./Home.jsx";
import "./styles/global.css";
import { CurrencyProvider } from "./context/CurrencyContext";
import { AuthProvider } from "./context/AuthContext";
import SocialLogin from "./pages/SocialLogin.jsx";

// Debug logs (keep them)
console.log("VITE_API_URL =", import.meta.env.VITE_API_URL);
console.log("Stripe key =", import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const root = document.getElementById("root");

createRoot(root).render(
  <AuthProvider>
    <CurrencyProvider>
      <BrowserRouter>
        <Routes>
          {/* OAuth redirect landing page */}
          <Route path="/social-login" element={<SocialLogin />} />
          {/* Everything else goes to homepage */}
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </CurrencyProvider>
  </AuthProvider>
);
