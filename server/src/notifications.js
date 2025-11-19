export const sendProfileWelcome = async ({ email, username, subscribeNewsletter }) => {
  if (!email) return;
  try {
    console.log("📧 Sending profile welcome email:", {
      email,
      username,
      subscribeNewsletter,
    });
  } catch (error) {
    console.error("Unable to send profile welcome email", error);
  }
};
