import React, { useState } from "react";
import CurrencyToggle from "./CurrencyToggle";
import AuthModal from "./AuthModal";
import { useAuth } from "../context/AuthContext";
import "./HamburgerMenu.css";

export default function HamburgerMenu() {
  const [showAuth, setShowAuth] = useState(false);
  const { currentUser, logout } = useAuth();

  return (
    <>
      <section className="hamburger-menu">
        {!currentUser ? (
          <div className="legal-card glassy" onClick={() => setShowAuth(true)}>
            <h3 className="legal-card-title">Log In / Sign Up</h3>
          </div>
        ) : (
          <div className="legal-card glassy">
            <h3 className="legal-card-title">Logged in as {currentUser.email}</h3>
            <button className="logout-btn" onClick={logout}>Log out</button>
          </div>
        )}

        <div className="hamburger-menu-text">
          <h3>Currency</h3>
          <p>Select how prices are displayed across the site.</p>
        </div>
        <CurrencyToggle />
      </section>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </>
  );
}
