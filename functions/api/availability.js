const SOURCE_URL = "https://www.schiermonnikoog.com/AccoServlet?accoID=2232";
const CACHE_SECONDS = 30 * 60;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function extractDateArray(html, variableName) {
  const declaration = new RegExp(
    `(?:var|let|const)\\s+${variableName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*;`,
  ).exec(html);

  if (!declaration) {
    throw new Error(`Missing ${variableName} in upstream calendar`);
  }

  const dates = [];
  const quotedValue = /(['"])(.*?)\1/g;
  let match;
  while ((match = quotedValue.exec(declaration[1])) !== null) {
    if (!ISO_DATE.test(match[2]) || !isCalendarDate(match[2])) {
      throw new Error(`Invalid date in ${variableName}`);
    }
    dates.push(match[2]);
  }

  return new Set(dates);
}

function isCalendarDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function amsterdamToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function extractMaxDate(html) {
  const match = /maxDate\s*:\s*new\s+Date\(\s*(['"])(\d{4}-\d{2}-\d{2})\1\s*\)/.exec(
    html,
  );
  if (!match || !isCalendarDate(match[2])) {
    throw new Error("Missing or invalid upstream calendar horizon");
  }
  return match[2];
}

export function parseAvailability(html, today = amsterdamToday()) {
  if (typeof html !== "string" || html.length === 0 || !isCalendarDate(today)) {
    throw new Error("Invalid calendar input");
  }

  const occupied = extractDateArray(html, "occupieddates");
  const arrivals = extractDateArray(html, "arrivaldates");
  const maxDate = extractMaxDate(html);

  if (occupied.size === 0 || arrivals.size === 0 || maxDate < today) {
    throw new Error("Upstream calendar data is incomplete");
  }

  const dayCount = Math.round(
    (new Date(`${maxDate}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86400000,
  );
  if (dayCount > 1100) {
    throw new Error("Upstream calendar horizon is unexpectedly large");
  }

  const dates = [];
  for (let date = today; date <= maxDate; date = addDays(date, 1)) {
    let status = "available";
    // The source gives an overlapping occupied/arrival date the selectable
    // `arrival` class. Only that overlap is a shared checkout/check-in day.
    if (occupied.has(date) && arrivals.has(date)) status = "turnover";
    else if (occupied.has(date)) status = "unavailable";
    dates.push({ date, status });
  }

  return dates;
}

function json(body, status, cacheControl = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(new URL(context.request.url).origin + "/api/availability", {
    method: "GET",
  });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const upstream = await fetch(SOURCE_URL, {
      headers: {
        Accept: "text/html",
        "User-Agent": "AanwaaienAvailabilityMirror/1.0 (+https://aanwaaien.nl)",
      },
      redirect: "follow",
    });

    if (!upstream.ok) throw new Error(`Upstream returned ${upstream.status}`);

    const dates = parseAvailability(await upstream.text());
    const response = json({ dates }, 200, `public, max-age=${CACHE_SECONDS}`);
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("Availability synchronization failed", error);
    return json({ error: "Availability temporarily unavailable" }, 503);
  }
}
