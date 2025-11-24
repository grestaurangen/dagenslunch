const DATA_URL = "data/lunches.json";
const STORAGE_KEYS = {
  selections: "grestaurangen_weekly_selections",
  customLunches: "grestaurangen_custom_lunches",
  adminSession: "grestaurangen_admin_session",
  closedMessages: "grestaurangen_closed_messages",
  closedPersistent: "grestaurangen_closed_persistent"
};
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKDAY_LABELS = {
  monday: "Måndag",
  tuesday: "Tisdag",
  wednesday: "Onsdag",
  thursday: "Torsdag",
  friday: "Fredag"
};
const ADMIN_PIN = "verran94";
const WEEK_HISTORY_SPAN = 52; // antal veckor bakåt i listan

let baseLunches = [];

document.addEventListener("DOMContentLoaded", () => {
  initPage();
});

const RESTAURANT_ADDRESS = "Rönnbäcken 12, 931 92 Skellefteå";

async function initPage() {
  await ensureBaseLunches();
  const page = document.body.dataset.page || "index";

  if (page === "index") {
    renderTodayView();
    initContactAndDirections();
  } else if (page === "weekly") {
    renderWeeklyView();
    initContactAndDirections();
  } else if (page === "admin") {
    initAdminView();
  }
}

async function ensureBaseLunches() {
  if (baseLunches.length) return baseLunches;
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error("Kunde inte läsa lunchfilen.");
    const data = await response.json();
    baseLunches = Array.isArray(data) ? data.map(normalizeLunch) : [];
  } catch (error) {
    console.error(error);
    baseLunches = [];
  }
  return baseLunches;
}

function normalizeLunch(lunch) {
  const id = lunch.id || slugify(lunch.title || "");
  return {
    id,
    title: lunch.title || "Okänd rätt",
    detail: lunch.detail || "",
    allergens: lunch.allergens || ""
  };
}

async function getAllLunches() {
  const custom = getCustomLunches();
  return [...baseLunches, ...custom];
}

function getCustomLunches() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.customLunches);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeLunch) : [];
  } catch {
    return [];
  }
}

function saveCustomLunches(lunches) {
  localStorage.setItem(STORAGE_KEYS.customLunches, JSON.stringify(lunches));
}

function getSelectionMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.selections);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSelectionMap(map) {
  localStorage.setItem(STORAGE_KEYS.selections, JSON.stringify(map));
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `lunch-${Date.now()}`;
}

function getIsoWeekNumber(date) {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  return { year: tmp.getUTCFullYear(), week: weekNo };
}

function formatWeekInputValue(date) {
  const { year, week } = getIsoWeekNumber(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function toWeekKey(value) {
  if (!value || !value.includes("-W")) return null;
  return value;
}

function getTodayDayKey() {
  const day = new Date().getDay();
  return WEEKDAYS[day - 1] || null;
}

function findLunchById(lunches, id) {
  return lunches.find(lunch => lunch.id === id);
}

function getWeekStart(date) {
  const tmp = new Date(date);
  const day = (tmp.getDay() + 6) % 7; // måndag = 0
  tmp.setDate(tmp.getDate() - day);
  tmp.setHours(0, 0, 0, 0);
  return tmp;
}

function formatWeekLabel(date) {
  const { week } = getIsoWeekNumber(date);
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 4);
  const formatter = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });
  return `Vecka ${week} (${formatter.format(start)} – ${formatter.format(end)})`;
}

function buildWeekOptions() {
  const today = new Date();
  const currentWeek = new Date(today);
  const pastWeek = new Date(today);
  pastWeek.setDate(today.getDate() - 7);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  const options = [];
  const seen = new Set();
  
  // Add past week, current week, and next week
  [pastWeek, currentWeek, nextWeek].forEach(date => {
    const value = formatWeekInputValue(date);
    if (!seen.has(value)) {
      seen.add(value);
      options.push({ value, label: formatWeekLabel(date) });
    }
  });

  options.sort((a, b) => (a.value < b.value ? 1 : -1)); // senaste överst
  return options;
}

function renderLunch(container, lunch) {
  container.classList.remove("placeholder");
container.innerHTML = `
    <h3>${lunch.title}</h3>
    <p class="menu-detail">${lunch.detail || "Detaljer saknas."}</p>
    <p class="tagline">${lunch.allergens ? `Allergener: ${lunch.allergens}` : "Allergeninfo saknas."}</p>
  `;
}

function renderPlaceholder(container, message) {
  container.classList.add("placeholder");
  container.innerHTML = `<p>${message}</p>`;
}

function getTodayDateKey() {
  const today = new Date();
  return today.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

function getClosedMessages() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.closedMessages);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveClosedMessages(messages) {
  localStorage.setItem(STORAGE_KEYS.closedMessages, JSON.stringify(messages));
}

function getClosedMessageForToday() {
  const todayKey = getTodayDateKey();
  const messages = getClosedMessages();
  return messages[todayKey] || null;
}

function getPersistentClosed() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.closedPersistent);
    if (!stored) return null;
    const data = JSON.parse(stored);
    return data.isClosed ? data : null;
  } catch {
    return null;
  }
}

function savePersistentClosed(isClosed, message) {
  if (isClosed) {
    localStorage.setItem(STORAGE_KEYS.closedPersistent, JSON.stringify({
      isClosed: true,
      message: message || ""
    }));
  } else {
    localStorage.removeItem(STORAGE_KEYS.closedPersistent);
  }
}

async function renderTodayView() {
  const container = document.getElementById("today-container");
  if (!container) return;

  // Check for persistent closed status first - this overrides everything
  const persistentClosed = getPersistentClosed();
  if (persistentClosed && persistentClosed.isClosed) {
    renderPlaceholder(container, persistentClosed.message || "Restaurangen är stängd tillsvidare.");
    return;
  }

  // Check for today's closed message - this overrides lunch but not persistent
  const closedMessage = getClosedMessageForToday();
  if (closedMessage && closedMessage.isClosed) {
    renderPlaceholder(container, closedMessage.message || "Restaurangen är stängd idag.");
    return;
  }

  const dayKey = getTodayDayKey();
  if (!dayKey) {
    renderPlaceholder(container, "Dagens lunch serveras måndag till fredag.");
    return;
  }

  const lunches = await getAllLunches();
  const selections = getSelectionMap();
  const weekKey = formatWeekInputValue(new Date());
  const lunchId = selections[weekKey]?.[dayKey];

  if (!lunchId) {
    renderPlaceholder(container, "Ingen lunch har lagts upp för idag ännu.");
    return;
  }

  const lunch = findLunchById(lunches, lunchId);
  if (lunch) {
    renderLunch(container, lunch);
  } else {
    renderPlaceholder(container, "Den valda rätten hittades inte längre i listan.");
  }
}

async function renderWeeklyView() {
  const section = document.getElementById("weekly-section");
  if (!section) return;

  const weekPicker = document.getElementById("weekly-week-picker");
  const lunches = await getAllLunches();
  populateWeekSelect(weekPicker);
  const initialWeek = setInitialWeekValue(weekPicker);
  drawWeek(initialWeek);

  weekPicker?.addEventListener("change", event => {
    drawWeek(event.target.value);
  });

  function drawWeek(weekValue) {
    const weekKey = toWeekKey(weekValue);
    const selections = getSelectionMap();
    section.innerHTML = "";

    WEEKDAYS.forEach(dayKey => {
      const card = document.createElement("article");
      card.className = "day-card";
      const heading = document.createElement("h3");
      heading.textContent = WEEKDAY_LABELS[dayKey];
      const content = document.createElement("div");
      content.id = `${dayKey}-weekly`;

      const lunchId = weekKey ? selections[weekKey]?.[dayKey] : null;
      if (lunchId) {
        const lunch = findLunchById(lunches, lunchId);
        if (lunch) {
          content.innerHTML = `
            <p class="menu-detail"><strong>${lunch.title}</strong></p>
            <p class="menu-detail">${lunch.detail || "Detaljer saknas."}</p>
            <p class="tagline">${lunch.allergens ? `Allergener: ${lunch.allergens}` : "Allergeninfo saknas."}</p>
          `;
        } else {
          content.innerHTML = `<p class="placeholder">Vald rätt saknas i arkivet.</p>`;
        }
      } else {
        content.innerHTML = `<p class="placeholder">Ingen lunch vald ännu.</p>`;
      }

      card.appendChild(heading);
      card.appendChild(content);
      section.appendChild(card);
    });
  }
}

function isAdminLoggedIn() {
  return sessionStorage.getItem(STORAGE_KEYS.adminSession) === "true";
}

function setAdminLoggedIn(value) {
  if (value) {
    sessionStorage.setItem(STORAGE_KEYS.adminSession, "true");
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.adminSession);
  }
}

function disableAdminForms() {
  const panel = document.getElementById("admin-panel");
  const newLunchSection = document.getElementById("new-lunch");
  const closedSection = document.getElementById("closed-override");
  const allInputs = document.querySelectorAll("#admin-panel input, #admin-panel select, #admin-panel textarea, #admin-panel button");
  const allNewInputs = document.querySelectorAll("#new-lunch input, #new-lunch textarea, #new-lunch button");
  const allClosedInputs = document.querySelectorAll("#closed-override input, #closed-override textarea, #closed-override button");
  
  if (panel) {
    allInputs.forEach(el => {
      if (el.type !== "button" || el.id === "logout-btn") return;
      el.disabled = true;
    });
  }
  
  if (newLunchSection) {
    allNewInputs.forEach(el => {
      if (el.type !== "submit") return;
      el.disabled = true;
    });
  }

  if (closedSection) {
    allClosedInputs.forEach(el => {
      if (el.type !== "submit") return;
      el.disabled = true;
    });
  }
}

function enableAdminForms() {
  const allInputs = document.querySelectorAll("#admin-panel input, #admin-panel select, #admin-panel textarea, #admin-panel button");
  const allNewInputs = document.querySelectorAll("#new-lunch input, #new-lunch textarea, #new-lunch button");
  const allClosedInputs = document.querySelectorAll("#closed-override input, #closed-override textarea, #closed-override button");
  
  allInputs.forEach(el => {
    el.disabled = false;
  });
  
  allNewInputs.forEach(el => {
    el.disabled = false;
  });

  allClosedInputs.forEach(el => {
    el.disabled = false;
  });
}

async function initAdminView() {
  const loginSection = document.getElementById("admin-login");
  const panel = document.getElementById("admin-panel");
  const newLunchSection = document.getElementById("new-lunch");
  const closedSection = document.getElementById("closed-override");
  const loginForm = document.getElementById("login-form");
  const loginInput = document.getElementById("admin-pass");
  const loginError = document.getElementById("login-error");
  const logoutBtn = document.getElementById("logout-btn");
  const weekPicker = document.getElementById("week-picker");
  const weekForm = document.getElementById("week-form");
  const weekFeedback = document.getElementById("week-feedback");
  const newLunchForm = document.getElementById("new-lunch-form");
  const newLunchFeedback = document.getElementById("new-lunch-feedback");
  const closedForm = document.getElementById("closed-form");
  const closedCheckbox = document.getElementById("closed-checkbox");
  const closedPersistentCheckbox = document.getElementById("closed-persistent-checkbox");
  const closedMessage = document.getElementById("closed-message");
  const closedFeedback = document.getElementById("closed-feedback");
  const selects = Array.from(document.querySelectorAll("select[data-day]"));

  if (!loginForm || !panel) return;

  // Disable all admin forms initially
  disableAdminForms();

  // Check if already logged in from previous session
  if (isAdminLoggedIn()) {
    unlockAdmin();
  }

  // Load current closed state (persistent first, then today)
  const persistentClosed = getPersistentClosed();
  if (persistentClosed) {
    closedPersistentCheckbox.checked = true;
    closedMessage.value = persistentClosed.message || "";
    // If persistent is active, disable today checkbox
    closedCheckbox.disabled = true;
  } else {
    const todayClosed = getClosedMessageForToday();
    if (todayClosed) {
      closedCheckbox.checked = todayClosed.isClosed;
      closedMessage.value = todayClosed.message || "";
    }
  }

  // Handle persistent checkbox change - enable/disable today checkbox
  closedPersistentCheckbox.addEventListener("change", () => {
    if (closedPersistentCheckbox.checked) {
      closedCheckbox.checked = false;
      closedCheckbox.disabled = true;
    } else {
      closedCheckbox.disabled = false;
    }
  });

  const lunches = await getAllLunches();
  populateSelectOptions(selects, lunches);

  loginForm.addEventListener("submit", event => {
    event.preventDefault();
    const value = loginInput.value.trim();
    if (value === ADMIN_PIN) {
      setAdminLoggedIn(true);
      unlockAdmin();
      loginInput.value = "";
      loginError.hidden = true;
    } else {
      loginError.hidden = false;
    }
  });

  logoutBtn?.addEventListener("click", () => {
    setAdminLoggedIn(false);
    lockAdmin();
  });

  populateWeekSelect(weekPicker);
  const initialWeek = setInitialWeekValue(weekPicker);
  applySelectionsToForm(selects, initialWeek);

  weekForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!isAdminLoggedIn()) {
      alert("Du måste logga in för att spara ändringar.");
      return;
    }
    
    const weekKey = toWeekKey(weekPicker.value);
    if (!weekKey) return;

    const selections = getSelectionMap();
    selections[weekKey] = selections[weekKey] || {};

    selects.forEach(select => {
      const day = select.dataset.day;
      const value = select.value;
      if (value) {
        selections[weekKey][day] = value;
      } else {
        delete selections[weekKey][day];
      }
    });

    saveSelectionMap(selections);
    showFeedback(weekFeedback);
  });

  weekPicker.addEventListener("change", () => {
    if (!isAdminLoggedIn()) return;
    applySelectionsToForm(selects, weekPicker.value);
  });

  newLunchForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!isAdminLoggedIn()) {
      alert("Du måste logga in för att lägga till nya luncher.");
      return;
    }
    
    const title = document.getElementById("lunch-title").value.trim();
    const detail = document.getElementById("lunch-detail").value.trim();
    const allergens = document.getElementById("lunch-allergens").value.trim();
    if (!title || !detail) return;

    const newEntry = normalizeLunch({
      id: `${slugify(title)}-${Date.now().toString(36)}`,
      title,
      detail,
      allergens
    });

    const custom = getCustomLunches();
    custom.push(newEntry);
    saveCustomLunches(custom);
    populateSelectOptions(selects, [...baseLunches, ...custom]);
    showFeedback(newLunchFeedback);
    newLunchForm.reset();
  });

  closedForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!isAdminLoggedIn()) {
      alert("Du måste logga in för att spara meddelandet.");
      return;
    }

    const messageText = closedMessage.value.trim();
    const isPersistent = closedPersistentCheckbox.checked;
    const isTodayClosed = closedCheckbox.checked && !isPersistent;

    if (isPersistent) {
      // Persistent closed - save and it will apply to all days
      savePersistentClosed(true, messageText);
      // Clear today's closed status since persistent overrides it
      const todayKey = getTodayDateKey();
      const messages = getClosedMessages();
      delete messages[todayKey];
      saveClosedMessages(messages);
      showFeedback(closedFeedback);
    } else if (isTodayClosed) {
      // Today only closed
      const todayKey = getTodayDateKey();
      const messages = getClosedMessages();
      messages[todayKey] = {
        isClosed: true,
        message: messageText
      };
      saveClosedMessages(messages);
      showFeedback(closedFeedback);
    } else {
      // Not closed - remove both persistent and today
      savePersistentClosed(false, "");
      const todayKey = getTodayDateKey();
      const messages = getClosedMessages();
      delete messages[todayKey];
      saveClosedMessages(messages);
      closedMessage.value = "";
      showFeedback(closedFeedback);
    }
  });

  function unlockAdmin() {
    loginSection.hidden = true;
    panel.hidden = false;
    newLunchSection.hidden = false;
    closedSection.hidden = false;
    enableAdminForms();
  }

  function lockAdmin() {
    panel.hidden = true;
    newLunchSection.hidden = true;
    closedSection.hidden = true;
    loginSection.hidden = false;
    disableAdminForms();
    loginInput.value = "";
  }
}

function populateSelectOptions(selects, lunches) {
  selects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = `
      <option value="">— Välj lunch —</option>
      ${lunches
        .map(lunch => `<option value="${lunch.id}">${lunch.title}</option>`)
        .join("")}
    `;
    if (currentValue) {
      select.value = currentValue;
    }
  });
}

function applySelectionsToForm(selects, weekValue) {
  const weekKey = toWeekKey(weekValue);
  const selections = getSelectionMap();
  selects.forEach(select => {
    const day = select.dataset.day;
    const selected = weekKey ? selections[weekKey]?.[day] : null;
    select.value = selected || "";
  });
}

function showFeedback(element) {
  if (!element) return;
  element.hidden = false;
  setTimeout(() => {
    element.hidden = true;
  }, 2500);
}

function populateWeekSelect(select) {
  if (!select) return;
  const options = buildWeekOptions();
  select.innerHTML = options
    .map(option => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function setInitialWeekValue(select) {
  if (!select) return "";
  const currentWeek = formatWeekInputValue(new Date());
  const fallback = select.options[0]?.value || "";
  const value = select.querySelector(`option[value="${currentWeek}"]`) ? currentWeek : fallback;
  select.value = value;
  return value;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function openDirections() {
  const address = encodeURIComponent(RESTAURANT_ADDRESS);
  let mapsUrl;
  
  if (isIOS()) {
    // Apple Maps
    mapsUrl = `maps://maps.apple.com/?daddr=${address}`;
  } else {
    // Google Maps
    mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${address}`;
  }
  
  window.open(mapsUrl, '_blank');
}

function initContactAndDirections() {
  const contactBtn = document.getElementById('contact-btn');
  const directionsBtn = document.getElementById('directions-btn');
  const contactModal = document.getElementById('contact-modal');
  const contactModalClose = document.getElementById('contact-modal-close');
  
  if (contactBtn && contactModal) {
    contactBtn.addEventListener('click', () => {
      contactModal.hidden = false;
      document.body.style.overflow = 'hidden'; // Prevent background scrolling
    });
  }
  
  if (contactModalClose) {
    contactModalClose.addEventListener('click', () => {
      contactModal.hidden = true;
      document.body.style.overflow = ''; // Restore scrolling
    });
  }
  
  // Close modal when clicking overlay
  if (contactModal) {
    const overlay = contactModal.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        contactModal.hidden = true;
        document.body.style.overflow = '';
      });
    }
    
    // Close modal on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !contactModal.hidden) {
        contactModal.hidden = true;
        document.body.style.overflow = '';
      }
    });
  }
  
  if (directionsBtn) {
    directionsBtn.addEventListener('click', openDirections);
  }
}
