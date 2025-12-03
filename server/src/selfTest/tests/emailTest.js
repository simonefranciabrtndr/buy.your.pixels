export async function emailTest() {
  try {
    const res = await fetch("https://api.resend.com/domains", { method: "GET" });
    return { success: res.ok, status: res.status };
  } catch (error) {
    return { success: false, error: error?.message || "Resend unreachable" };
  }
}
