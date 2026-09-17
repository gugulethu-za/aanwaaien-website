import { canStay, isChangeover, isValidArrival } from "./calendar-rules.js";


const root = document.querySelector("#availability-calendar");
// TEMPORARY calendar diagnostics: remove after investigating clickability.
console.log("[calendar-debug] loaded v1", { calendarFound: Boolean(root) });

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
  let availabilityLoaded = false;

  const dateObject = (value) => new Date(`${value}T00:00:00Z`);
  const pretty = (value) => dateFormatter.format(dateObject(value));
  const iso = (date) => date.toISOString().slice(0, 10);
  const monthKey = (date) => iso(date).slice(0, 7);
  const addMonths = (value, count) => {
    const date = new Date(`${value}-01T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + count);
    return monthKey(date);
  };

  // Log a serialized snapshot so later clicks cannot change the console values.
  function logSelection(stage, date, extra = {}) {
    const validArrival = isValidArrival(availability, date);
    const validStay = canStay(availability, arrival, date);
    let firstBlockedNight = null;
    if (arrival && date > arrival) {
      for (const night = dateObject(arrival); iso(night) < date; night.setUTCDate(night.getUTCDate() + 1)) {
        const key = iso(night);
        const status = availability.get(key);
        if (status !== "available" && !(key === arrival && status === "checkout_available")) {
          firstBlockedNight = { date: key, status: status ?? "missing" };
          break;
        }
      }
    }
    console.log(`[calendar-debug] ${stage}`, JSON.stringify({
      date,
      weekday: dateObject(date).getUTCDay(),
      status: availability.get(date) ?? "missing",
      changeover: isChangeover(date),
      arrival,
      departure,
      arrivalStatus: availability.get(arrival) ?? "missing",
      isValidArrival: validArrival,
      canStay: validStay,
      validArrival: !arrival && validArrival,
      validDeparture: Boolean(!departure && arrival && date > arrival && isChangeover(date) && validStay),
      startsNewArrival: Boolean(departure && validArrival),
      cancelsArrival: Boolean(arrival && !departure && date === arrival),
      firstBlockedNight,
      ...extra,
    }));
  }

  // Disabled buttons do not fire click handlers. Observe pointer attempts too,
  // without enabling the button or changing booking behavior.
  document.addEventListener("pointerdown", (event) => {
    const button = [...monthsNode.querySelectorAll("button[data-date]")].find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (button) logSelection("pointerdown", button.dataset.date, {
      disabled: button.disabled,
      classes: button.className,
      targetTag: event.target?.tagName,
      targetClasses: event.target instanceof Element ? event.target.getAttribute("class") : null,
      targetIsButton: event.target === button || button.contains(event.target),
    });
  }, true);

  function dayLabel(date, status, changeover) {
    const description =
      status === "unavailable"
        ? "bezet"
        : status === "checkout_available"
          ? "vertrek in de ochtend, aankomst mogelijk in de middag"
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

        // Fixed weekly changeover markers, independent of booking availability.
        if (changeover) button.classList.add("is-changeover");
        if (dateObject(date).getUTCDay() === 5) button.classList.add("is-friday");

        if (!status) {
          button.classList.add("is-outside");
          button.disabled = true;
          if (changeover) {
            button.setAttribute("aria-label", `${pretty(date)}, wisseldag, beschikbaarheid onbekend`);
          } else {
            button.setAttribute("aria-hidden", "true");
          }
        } else {
          button.setAttribute("aria-label", dayLabel(date, status, changeover));
          if (status === "unavailable") button.classList.add("is-unavailable");
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
        if (changeover) logSelection("render", date, { disabled: button.disabled });
        grid.append(button);
      }
      section.append(grid);
      monthsNode.append(section);
    }

    previous.disabled = visibleMonth <= firstMonth;
    next.disabled = addMonths(visibleMonth, 1) >= lastMonth;
    updateRequestButton();
  }

  function selectDate(date) {
    logSelection("click-handler entered", date);
    if (arrival && !departure && date === arrival) {
      console.log("[calendar-debug] decision", date, "cancel arrival");
      resetSelection();
      render();
      return;
    }

    if (departure) {
      arrival = null;
      departure = null;
    }

    logSelection("click-handler checks (after any selection reset)", date);
    if (!arrival && isValidArrival(availability, date)) {
      console.log("[calendar-debug] decision", date, "accept arrival");
      arrival = date;
      selectionNode.textContent = `Aankomst: ${pretty(date)}. Kies een vertrekdag.`;
    } else if (canStay(availability, arrival, date)) {
      console.log("[calendar-debug] decision", date, "accept departure");
      departure = date;
      const line = `${pretty(arrival)} t/m ${pretty(departure)}`;
      selectionNode.textContent = line;
    } else {
      console.log("[calendar-debug] decision", date, "reject selection");
    }
    render();
  }

  function resetSelection() {
    arrival = null;
    departure = null;
    selectionNode.textContent = "Selecteer een beschikbare aankomstdag";
    updateRequestButton();
  }

  function updateRequestButton() {
    const ready = Boolean(departure);
    mail.disabled = !ready;
    mail.setAttribute("aria-disabled", String(!ready));
  }

  mail.addEventListener("click", () => {
    if (!departure) {
      updateRequestButton();
      return;
    }

    const bookingUrl = new URL("/boeken", window.location.origin);
    bookingUrl.searchParams.set("arrival", arrival);
    bookingUrl.searchParams.set("departure", departure);
    window.location.assign(bookingUrl.pathname + bookingUrl.search);
  });

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
        !["available", "unavailable", "turnover", "checkout_available"].includes(item.status)
      ) {
        throw new Error("Invalid availability response");
      }
      availability.set(item.date, item.status);
    }

    const dates = [...availability.keys()].sort();
    firstMonth = dates[0].slice(0, 7);
    lastMonth = dates.at(-1).slice(0, 7);
    visibleMonth = firstMonth;
    availabilityLoaded = true;
    error.hidden = true;
    loading.hidden = true;
    content.hidden = false;
    render();
  } catch (reason) {
    console.error("Availability loading failed", reason);
    if (!availabilityLoaded) {
      loading.hidden = true;
      content.hidden = true;
      error.hidden = false;
    }
  }
}
