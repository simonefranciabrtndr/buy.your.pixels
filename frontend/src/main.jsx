import React from "react";
console.log("VITE_API_BASE_URL =", import.meta.env.VITE_API_BASE_URL);
console.log("Stripe key =", import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./Home.jsx";
import "./styles/global.css";
import { CurrencyProvider } from "./context/CurrencyContext";
import { AuthProvider } from "./context/AuthContext";
import SocialLogin from "./pages/SocialLogin.jsx";

createRoot(document.getElementById("root")).render(
  <AuthProvider>
    <CurrencyProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/social-login" element={<SocialLogin />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </CurrencyProvider>
  </AuthProvider>
);
