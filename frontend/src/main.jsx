import React from "react";
console.log("VITE_API_BASE_URL =", import.meta.env.VITE_API_BASE_URL);
import { createRoot } from "react-dom/client";
import Home from "./Home.jsx";
import "./styles/global.css";

createRoot(document.getElementById("root")).render(<Home />);
