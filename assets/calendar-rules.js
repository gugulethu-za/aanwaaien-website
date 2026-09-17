export function isChangeover(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 1 || weekday === 5;
}

export function isValidArrival(availability, date) {
  return isChangeover(date) && ["available", "checkout_available"].includes(availability.get(date));
}

export function canStay(availability, start, end) {
  if (!start || !end || end <= start || !isChangeover(start) || !isChangeover(end)) {
    return false;
  }
  if (!isValidArrival(availability, start)) return false;

  for (let date = start; date < end; date = addDays(date, 1)) {
    if (date === start && availability.get(date) === "checkout_available") continue;
    if (availability.get(date) !== "available") return false;
  }

  const departureStatus = availability.get(end);
  return departureStatus === "available" || departureStatus === "turnover";
}

function addDays(value, count) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
