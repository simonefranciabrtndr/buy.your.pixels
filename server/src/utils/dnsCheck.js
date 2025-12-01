import dns from "dns/promises";

export async function resolveDomainDiagnostics(domain = "yourpixels.online") {
  try {
    const rawTxt = await dns.resolveTxt(domain);
    const txtRecords = (rawTxt || []).map((entry) => entry.join(""));

    const spfRecords = txtRecords.filter((record) =>
      record.toLowerCase().startsWith("v=spf1")
    );
    const spfRecord = spfRecords[0] || null;

    const notes = [];
    if (!spfRecord) notes.push("No SPF record found; add the recommended SPF.");
    if (spfRecords.length > 1) notes.push("Multiple SPF records detected; consolidate into a single SPF entry.");

    return {
      domain,
      txtRecords,
      spfRecord,
      hasMultipleSPF: spfRecords.length > 1,
      recommendedSPF: "v=spf1 include:amazonses.com -all",
      status: "ok",
      notes,
    };
  } catch (error) {
    return {
      status: "error",
      message: "DNS lookup failed",
      details: error.message,
    };
  }
}
