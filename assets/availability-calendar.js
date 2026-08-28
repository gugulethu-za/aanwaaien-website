import { canStay, isChangeover, isValidArrival } from "./calendar-rules.js";

const root = document.querySelector("#availability-calendar");

if (root) {
  const content = root.querySelector("[data-calendar-content]");
  const loading = root.querySelector("[data-calendar-loading]");
  const error = root.querySelector("[data-calendar-error]");
  const monthsNode = root.querySelector("[data-calendar-months]");
  const selectionNode = root.querySelector("[data-calendar-selection]");
  const mail = root.querySelector("[data-calendar-mail]");
  const previous = root.querySelector("[data-calendar-previous]");
  const next = root.querySelector("[data-calendar-next]");
  const weekdays = ["ma", "di", "wo", "do", "vr", "za", "zo"];
  const monthFormatter = new Intl.DateTimeFormat("nl-NL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dateFormatter = new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  let availability = new Map();
  let firstMonth;
  let lastMonth;
  let visibleMonth;
  let arrival = null;
  let departure = null;

  const dateObject = (value) => new Date(`${value}T00:00:00Z`);
  const pretty = (value) => dateFormatter.format(dateObject(value));
  const iso = (date) => date.toISOString().slice(0, 10);
  const monthKey = (date) => iso(date).slice(0, 7);
  const addMonths = (value, count) => {
    const date = new Date(`${value}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + count);
    return monthKey(date);
  };

  function dayLabel(date, status, changeover) {
    const description =
      status === "unavailable"
        ? "bezet"
        : status === "turnover"
          ? "alleen beschikbaar als vertrekdag"
          : changeover
            ? "beschikbare wisseldag"
            : "beschikbaar binnen een verblijf";
    return `${pretty(date)}, ${description}`;
  }

  function render() {
    monthsNode.replaceChildren();

    for (let offset = 0; offset < 2; offset += 1) {
      const key = addMonths(visibleMonth, offset);
      const start = new Date(`${key}-01T00:00:00Z`);
      const section = document.createElement("section");
      section.className = "availability-month";
      section.innerHTML = `
        <h3>${monthFormatter.format(start)}</h3>
        <div class="availability-weekdays" aria-hidden="true">
          ${weekdays.map((day) => `<span>${day}</span>`).join("")}
        </div>`;

      const grid = document.createElement("div");
      grid.className = "availability-days";
      const leadingBlanks = (start.getUTCDay() + 6) % 7;
      for (let index = 0; index < leadingBlanks; index += 1) {
        const blank = document.createElement("span");
        blank.className = "availability-blank";
        grid.append(blank);
      }

      const count = new Date(
        Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0),
      ).getUTCDate();
      for (let day = 1; day <= count; day += 1) {
        const date = iso(
          new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), day)),
        );
        const status = availability.get(date);
        const changeover = isChangeover(date);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "availability-day";
        button.textContent = day;
        button.dataset.date = date;

        if (!status) {
          button.classList.add("is-outside");
          button.disabled = true;
          button.setAttribute("aria-hidden", "true");
        } else {
          button.setAttribute("aria-label", dayLabel(date, status, changeover));
          if (status === "unavailable") button.classList.add("is-unavailable");
          if (status === "turnover") button.classList.add("is-turnover");
          if (!changeover) button.classList.add("is-non-changeover");

          const validArrival = !arrival && isValidArrival(availability, date);
          const validDeparture =
            !departure &&
            arrival &&
            date > arrival &&
            changeover &&
            canStay(availability, arrival, date);
          const startsNewArrival = departure && isValidArrival(availability, date);
          const cancelsArrival = arrival && !departure && date === arrival;
          button.disabled = !(
            validArrival ||
            validDeparture ||
            startsNewArrival ||
            cancelsArrival
          );
          if (date === arrival || date === departure) button.classList.add("is-selected");
          if (arrival && departure && date >= arrival && date <= departure) {
            button.classList.add("is-in-range");
          }
          button.addEventListener("click", () => selectDate(date));
        }
        grid.append(button);
      }
      section.append(grid);
      monthsNode.append(section);
    }

    previous.disabled = visibleMonth <= firstMonth;
    next.disabled = addMonths(visibleMonth, 1) >= lastMonth;
  }

  function selectDate(date) {
    if (arrival && !departure && date === arrival) {
      resetSelection();
      render();
      return;
    }

    if (departure) {
      arrival = null;
      departure = null;
    }

    if (!arrival && isValidArrival(availability, date)) {
      arrival = date;
      selectionNode.textContent = `Aankomst: ${pretty(date)}. Kies een vertrekdag.`;
      mail.removeAttribute("href");
      mail.setAttribute("aria-disabled", "true");
    } else if (canStay(availability, arrival, date)) {
      departure = date;
      const line = `${pretty(arrival)} t/m ${pretty(departure)}`;
      selectionNode.textContent = line;
      const body = `Hallo,\n\nIs Aanwaaien beschikbaar van ${line}?\n\nMet vriendelijke groet,`;
      mail.href = `mailto:info@aanwaaien.nl?subject=${encodeURIComponent("Beschikbaarheid Aanwaaien")}&body=${encodeURIComponent(body)}`;
      mail.setAttribute("aria-disabled", "false");
    }
    render();
  }

  function resetSelection() {
    arrival = null;
    departure = null;
    selectionNode.textContent = "Selecteer een beschikbare aankomstdag";
    mail.removeAttribute("href");
    mail.setAttribute("aria-disabled", "true");
  }

  previous.addEventListener("click", () => {
    visibleMonth = addMonths(visibleMonth, -1);
    render();
  });
  next.addEventListener("click", () => {
    visibleMonth = addMonths(visibleMonth, 1);
    render();
  });

  try {
    const response = await fetch("/api/availability", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.dates) || payload.dates.length === 0) {
      throw new Error("Invalid availability response");
    }

    for (const item of payload.dates) {
      if (
        !item ||
        typeof item.date !== "string" ||
        !["available", "unavailable", "turnover"].includes(item.status)
      ) {
        throw new Error("Invalid availability response");
      }
      availability.set(item.date, item.status);
    }

    const dates = [...availability.keys()].sort();
    firstMonth = dates[0].slice(0, 7);
    lastMonth = dates.at(-1).slice(0, 7);
    visibleMonth = firstMonth;
    loading.hidden = true;
    content.hidden = false;
    render();
  } catch (reason) {
    console.error("Availability loading failed", reason);
    loading.hidden = true;
    content.hidden = true;
    error.hidden = false;
  }
}
