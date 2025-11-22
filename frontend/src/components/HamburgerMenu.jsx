import React from "react";
import CurrencyToggle from "./CurrencyToggle";
import "./HamburgerMenu.css";

export default function HamburgerMenu() {
  return (
    <section className="hamburger-menu">
      <div className="hamburger-menu-text">
        <h3>Currency</h3>
        <p>Select how prices are displayed across the site.</p>
      </div>
      <CurrencyToggle />
    </section>
  );
}
