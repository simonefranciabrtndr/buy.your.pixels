import React, { useState } from "react";
import CurrencyToggle from "./CurrencyToggle";
import AuthModal from "./AuthModal";
import { useAuth } from "../context/AuthContext";
import "./HamburgerMenu.css";

export default function HamburgerMenu({ pricePerPixelDisplay }) {
  const [showAuth, setShowAuth] = useState(false);
  const { currentUser, logout } = useAuth();

  return (
    <>
      <section className="hamburger-menu">
        <div className="hamburger-menu-text">
          <h3>Currency</h3>
          <p>Select how prices are displayed across the site.</p>
        </div>
        <div className="currency-toggle-block">
          <div className="price-per-pixel-chip">{pricePerPixelDisplay} / px</div>
          <CurrencyToggle />
        </div>
      </section>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
