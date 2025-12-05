import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./Home.jsx";
import SocialLogin from "./pages/SocialLogin.jsx";
import SuccessPage from "./pages/Success";
import FailedPage from "./pages/Failed";
import SelfTest from "./pages/SelfTest";
import AdminOrders from "./pages/AdminOrders.jsx";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/social-login" element={<SocialLogin />} />
      <Route path="/success" element={<SuccessPage />} />
      <Route path="/failed" element={<FailedPage />} />
      <Route path="/self-test" element={<SelfTest />} />
      <Route path="/admin/orders" element={<AdminOrders />} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
