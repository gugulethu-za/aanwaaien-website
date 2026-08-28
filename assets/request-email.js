export function buildRequestMailto({ arrival, departure, pretty }) {
  if (!arrival || !departure || typeof pretty !== "function") {
    throw new Error("Complete request details are required");
  }

  const line = `${pretty(arrival)} t/m ${pretty(departure)}`;
  const subject = "Beschikbaarheid Aanwaaien";
  const body = `Hallo,\n\nIs Aanwaaien beschikbaar van ${line}?\n\nMet vriendelijke groet,`;
  return `mailto:info@aanwaaien.nl?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
