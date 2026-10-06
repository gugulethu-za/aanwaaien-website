import { buildRequestMailto } from "./request-email.js";
import { canStay, isChangeover, isValidArrival } from "./calendar-rules.js";


const root = document.querySelector("#availability-calendar");

if (root) {
  const content = root.querySelector("[data-calendar-content]");
  const loading = root.querySelector("[data-calendar-loading]");
  const error = root.querySelector("[data-calendar-error]");
  const monthsNode = root.querySelector("[data-calendar-months]");
  const selectionNode = root.querySelector("[data-calendar-selection]");
  const mail = root.querySelector("[data-calendar-mail]");
  const email = root.querySelector("[data-calendar-email]");
  // The visible address is the single source for both mailto links.
  const recipient = email.textContent.trim();
  email.href = `mailto:${recipient}`;
  const previous = root.querySelector("[data-calendar-previous]");
  const next = root.querySelector("[data-calendar-next]");
  const clear = root.querySelector("[data-calendar-clear]");
  const mobile = window.matchMedia("(max-width: 760px)");
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
  let previewDeparture = null;
  let previewSource = null;
  let inputType = "keyboard";
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
    previewDeparture = null;
    previewSource = null;
    const focusedDate = document.activeElement?.dataset?.date;
    monthsNode.replaceChildren();
    const localToday = new Date();
    const today = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, "0")}-${String(localToday.getDate()).padStart(2, "0")}`;

    for (let offset = 0; offset < (mobile.matches ? 1 : 2); offset += 1) {
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
        const cell = document.createElement("div");
        cell.className = "availability-cell";
        const number = document.createElement("span");
        number.textContent = day;
        button.append(number);
        const note = status === "unavailable" ? "Bezet" :
          ["turnover", "checkout_available"].includes(status) ? "Vertrekdag, aankomst mogelijk vanaf de middag" :
          status === "available" && changeover ? "Beschikbaar" : null;
        if (note) {
          const tooltip = document.createElement("span");
          tooltip.className = "availability-note";
          tooltip.id = `calendar-note-${date}`;
          tooltip.textContent = note;
          button.setAttribute("aria-describedby", tooltip.id);
          cell.append(tooltip);
        }
        if (date === today) {
          button.classList.add("is-today");
          button.setAttribute("aria-current", "date");
        }
        button.dataset.date = date;

        // Split markers describe real turnover availability, not the weekday booking rule.
        if (changeover && ["turnover", "checkout_available"].includes(status)) {
          button.classList.add("is-changeover");
        }
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
          const selectable = Boolean(
            validArrival ||
            validDeparture ||
            startsNewArrival ||
            cancelsArrival
          );
          button.setAttribute("aria-disabled", String(!selectable));
          button.addEventListener("click", () => {
            if (button.getAttribute("aria-disabled") !== "true") selectDate(date);
          });
        }
        button.addEventListener("pointerenter", (event) => {
          if (event.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches) {
            updatePreview(date, "pointer");
          }
        });
        button.addEventListener("pointerleave", () => {
          if (previewSource === "pointer") updatePreview(null, null);
        });
        button.addEventListener("focus", () => {
          if (inputType !== "touch") updatePreview(date, "focus");
        });
        button.addEventListener("blur", () => {
          if (previewSource === "focus") updatePreview(null, null);
        });
        cell.prepend(button);
        grid.append(cell);
      }
      section.append(grid);
      monthsNode.append(section);
    }

    previous.disabled = visibleMonth <= firstMonth;
    next.disabled = addMonths(visibleMonth, mobile.matches ? 0 : 1) >= lastMonth;
    paintSelection();
    updateRequestButton();
    if (focusedDate) monthsNode.querySelector(`[data-date="${focusedDate}"]`)?.focus();
  }

  function updatePreview(date, source) {
    const valid = !departure && arrival && date && date > arrival &&
      isChangeover(date) && canStay(availability, arrival, date);
    previewDeparture = valid ? date : null;
    previewSource = valid ? source : null;
    paintSelection();
  }

  // Preview updates existing date cells in place: no DOM replacement or focus loss.
  function paintSelection() {
    const end = departure || previewDeparture;
    for (const button of monthsNode.querySelectorAll("button[data-date]")) {
      const date = button.dataset.date;
      const selected = date === arrival || date === departure;
      const inRange = Boolean(arrival && end && date >= arrival && date <= end &&
        !button.classList.contains("is-unavailable"));
      const day = dateObject(date);
      const followingDay = new Date(day);
      followingDay.setUTCDate(day.getUTCDate() + 1);
      const cell = button.parentElement;
      cell.classList.toggle("is-range", inRange);
      cell.classList.toggle("is-range-start", inRange && date === arrival);
      cell.classList.toggle("is-range-end", inRange && date === end);
      cell.classList.toggle("is-range-left", inRange &&
        (date === arrival || day.getUTCDay() === 1 || day.getUTCDate() === 1));
      cell.classList.toggle("is-range-right", inRange &&
        (date === end || day.getUTCDay() === 0 || followingDay.getUTCDate() === 1));
      button.classList.toggle("is-selected", selected);
      button.classList.toggle("is-stay-interior", Boolean(arrival && end && date > arrival && date < end));
      button.classList.toggle("is-preview-end", Boolean(!departure && date === previewDeparture));
      if (selected) button.setAttribute("aria-pressed", "true");
      else button.removeAttribute("aria-pressed");
    }
    updateSummary();
  }

  root.addEventListener("keydown", () => { inputType = "keyboard"; });
  monthsNode.addEventListener("pointerdown", (event) => {
    inputType = event.pointerType === "touch" || event.pointerType === "pen" ? "touch" : "mouse";
  });
  monthsNode.addEventListener("pointerleave", () => {
    if (previewSource === "pointer") updatePreview(null, null);
  });

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
    } else if (canStay(availability, arrival, date)) {
      departure = date;
    }
    render();
  }

  function updateSummary() {
    const end = departure || previewDeparture;
    const nights = end ? Math.round((dateObject(end) - dateObject(arrival)) / 86400000) : 0;
    selectionNode.textContent = arrival
      ? `Aankomst: ${pretty(arrival)} \u00b7 Vertrek: ${end ? pretty(end) : "Kies een vertrekdag"}${end ? ` \u00b7 ${nights} ${nights === 1 ? "nacht" : "nachten"}` : ""}`
      : "Selecteer een beschikbare aankomstdag";
    clear.disabled = !arrival;
  }

  clear.addEventListener("click", () => { resetSelection(); render(); });
  mobile.addEventListener("change", () => {
    if (!availabilityLoaded) return;
    if (!mobile.matches && visibleMonth === lastMonth && firstMonth !== lastMonth) visibleMonth = addMonths(visibleMonth, -1);
    render();
  });
  let touchStart;
  monthsNode.addEventListener("touchstart", (event) => {
    touchStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
  }, { passive: true });
  monthsNode.addEventListener("touchend", (event) => {
    if (!touchStart || !mobile.matches) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : previous).click();
    touchStart = null;
  }, { passive: true });
  monthsNode.addEventListener("keydown", (event) => {
    inputType = "keyboard";
    const date = event.target.dataset.date;
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    if (!date || !step) return;
    event.preventDefault();
    const target = dateObject(date);
    target.setUTCDate(target.getUTCDate() + step);
    const key = iso(target);
    if (!availability.has(key)) return;
    if (!monthsNode.querySelector(`[data-date="${key}"]`)) {
      visibleMonth = monthKey(target);
      if (!mobile.matches && visibleMonth === lastMonth && firstMonth !== lastMonth) visibleMonth = addMonths(visibleMonth, -1);
      render();
    }
    monthsNode.querySelector(`[data-date="${key}"]`)?.focus();
  });

  function resetSelection() {
    arrival = null;
    departure = null;
    previewDeparture = null;
    previewSource = null;
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

    const link = document.createElement("a");
    link.href = buildRequestMailto({ arrival, departure, pretty, recipient });
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
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
