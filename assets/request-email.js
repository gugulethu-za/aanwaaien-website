export function buildRequestMailto({ arrival, departure, pretty, recipient }) {
  if (!arrival || !departure || typeof pretty !== "function" || !recipient) {
    throw new Error("Complete request details are required");
  }

  const nights = Math.round((new Date(`${departure}T00:00:00Z`) - new Date(`${arrival}T00:00:00Z`)) / 86400000);
  if (!Number.isFinite(nights) || nights <= 0) {
    throw new Error("A positive number of nights is required");
  }
  const period = `${pretty(arrival)} t/m ${pretty(departure)}`;
  const subject = `Aanvraag Aanwaaien: ${period} (${nights} ${nights === 1 ? "nacht" : "nachten"})`;
  const body = `Hallo,\n\nIs Aanwaaien beschikbaar voor deze periode?\n\nAankomst: ${pretty(arrival)}\nVertrek: ${pretty(departure)}\nAantal nachten: ${nights}\n\nMet vriendelijke groet,`;
  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
