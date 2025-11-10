import termsHtml from "./1_Terms_and_Conditions.html?raw";
import privacyHtml from "./2_Privacy_Policy.html?raw";
import cookieHtml from "./3_Cookie_Policy.html?raw";
import contentHtml from "./4_Content_Policy.html?raw";
import noticeHtml from "./5_Legal_Notice.html?raw";

const extractBody = (html) => {
  if (!html) return "";
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return (match ? match[1] : html).trim();
};

const withMeta = (doc) => ({
  ...doc,
  content: extractBody(doc.content),
});

export const legalDocuments = [
  {
    id: "terms",
    title: "Terms & Conditions",
    subtitle: "General terms of service",
    filename: "1_Terms_and_Conditions.html",
    content: termsHtml,
  },
  {
    id: "privacy",
    title: "Privacy Policy",
    subtitle: "Personal data handling",
    filename: "2_Privacy_Policy.html",
    content: privacyHtml,
  },
  {
    id: "cookies",
    title: "Cookie Policy",
    subtitle: "Cookie usage and preferences",
    filename: "3_Cookie_Policy.html",
    content: cookieHtml,
  },
  {
    id: "content",
    title: "Content Policy",
    subtitle: "Content guidelines",
    filename: "4_Content_Policy.html",
    content: contentHtml,
  },
  {
    id: "notice",
    title: "Legal Notice",
    subtitle: "Operator details",
    filename: "5_Legal_Notice.html",
    content: noticeHtml,
  },
].map(withMeta);
