export async function emailTest() {
  try {
    const res = await fetch("https://api.resend.com/domains", { method: "GET" });
    return { success: res.ok, status: res.status };
  } catch (error) {
    console.error("[SELF-TEST][EMAIL] Resend error:", {
      status: error?.status,
      message: error?.message,
      data: error?.response?.data
    });
    return {
      success: false,
      status: error?.status || 500,
      errorMessage: error?.message || "Unknown Resend error",
      errorData: error?.response?.data || null
    };
  }
}
