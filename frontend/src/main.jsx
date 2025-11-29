import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/global.css";
import { CurrencyProvider } from "./context/CurrencyContext";
import { AuthProvider } from "./context/AuthContext";
import AppRoutes from "./routes.jsx";

// Debug logs (keep them)
console.log("VITE_API_URL =", import.meta.env.VITE_API_URL);
console.log("Stripe key =", import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const root = document.getElementById("root");

createRoot(root).render(
  <AuthProvider>
    <CurrencyProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </CurrencyProvider>
  </AuthProvider>
);
