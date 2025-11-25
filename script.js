import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { firebaseConfig } from "./firebaseConfig.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const DATA_URL = "data/lunches.json";
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKDAY_LABELS = {
  monday: "Måndag",
  tuesday: "Tisdag",
  wednesday: "Onsdag",
  thursday: "Torsdag",
  friday: "Fredag"
};
const RESTAURANT_ADDRESS = "Rönnbäcken 12, 931 92 Skellefteå";

let lunchesCache = null;
const selectionCache = {};
let persistentClosedCache = undefined;
let todayClosedCache = undefined;

document.addEventListener("DOMContentLoaded", () => {
  initPage();
});

async function initPage() {
  const page = document.body.dataset.page || "index";
  await getAllLunches().catch(err => console.error("Kunde inte hämta luncher:", err));

  if (page === "index") {
    await renderTodayView();
    initContactAndDirections();
  } else if (page === "weekly") {
    await renderWeeklyView();
    initContactAndDirections();
  } else if (page === "admin") {
    await initAdminView();
  }
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

async function getAllLunches(force = false) {
  if (!force && lunchesCache) return lunchesCache;

  try {
    const [baseSnap, customSnap] = await Promise.all([
      getDocs(collection(db, "lunches")),
      getDocs(collection(db, "customLunches"))
    ]);

    const base = baseSnap.docs.map(item => normalizeLunch({ id: item.id, ...item.data() }));
    const custom = customSnap.docs.map(item => normalizeLunch({ id: item.id, ...item.data() }));
    const combined = [...base, ...custom];

    if (combined.length) {
      lunchesCache = combined;
      return lunchesCache;
    }
  } catch (error) {
    console.error("Kunde inte läsa luncher från Firestore:", error);
  }

  if (!lunchesCache) {
    try {
      const response = await fetch(DATA_URL);
      if (!response.ok) throw new Error("Kunde inte läsa lunchfilen.");
      const data = await response.json();
      lunchesCache = Array.isArray(data) ? data.map(normalizeLunch) : [];
    } catch (error) {
      console.error("Kunde inte läsa fallback-luncher:", error);
      lunchesCache = [];
    }
  }

  return lunchesCache;
}

async function fetchWeekSelection(weekKey, force = false) {
  if (!weekKey) return {};
  if (!force && selectionCache[weekKey]) return selectionCache[weekKey];

  try {
    const snap = await getDoc(doc(db, "weekSelections", weekKey));
    const data = snap.exists() ? snap.data() : {};
    selectionCache[weekKey] = data;
    return data;
  } catch (error) {
    console.error("Kunde inte läsa veckoval:", error);
    return selectionCache[weekKey] || {};
  }
}

async function saveWeekSelection(weekKey, payload) {
  if (!weekKey) return;
  try {
    await setDoc(doc(db, "weekSelections", weekKey), payload);
    selectionCache[weekKey] = payload;
  } catch (error) {
    console.error("Kunde inte spara veckoval:", error);
    throw error;
  }
}

function getTodayDateKey() {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

async function fetchPersistentClosed(force = false) {
  if (!force && persistentClosedCache !== undefined) return persistentClosedCache;
  try {
    const snap = await getDoc(doc(db, "flags", "persistentClosed"));
    persistentClosedCache = snap.exists() ? snap.data() : null;
    return persistentClosedCache;
  } catch (error) {
    console.error("Kunde inte läsa tillsvidare-stängning:", error);
    persistentClosedCache = null;
    return null;
  }
}

async function savePersistentClosed(isClosed, message) {
  const docRef = doc(db, "flags", "persistentClosed");
  if (isClosed) {
    await setDoc(docRef, {
      isClosed: true,
      message: message || "",
      updatedAt: serverTimestamp()
    });
    persistentClosedCache = { isClosed: true, message };
  } else {
    try {
      await deleteDoc(docRef);
    } catch (error) {
      console.warn("Ingen tillsvidare-stängning att ta bort:", error.message);
    }
    persistentClosedCache = null;
  }
}

async function fetchTodayClosed(force = false) {
  if (!force && todayClosedCache !== undefined) return todayClosedCache;
  const dateKey = getTodayDateKey();
  try {
    const snap = await getDoc(doc(db, "closedOverrides", dateKey));
    todayClosedCache = snap.exists() ? snap.data() : null;
    return todayClosedCache;
  } catch (error) {
    console.error("Kunde inte läsa dagens stängning:", error);
    todayClosedCache = null;
    return null;
  }
}

async function saveTodayClosed(message) {
  const dateKey = getTodayDateKey();
  await setDoc(doc(db, "closedOverrides", dateKey), {
    isClosed: true,
    message: message || "",
    updatedAt: serverTimestamp()
  });
  todayClosedCache = { isClosed: true, message };
}

async function clearTodayClosed() {
  const dateKey = getTodayDateKey();
  try {
    await deleteDoc(doc(db, "closedOverrides", dateKey));
  } catch (error) {
    console.warn("Ingen dagens stängning att ta bort:", error.message);
  }
  todayClosedCache = null;
}

async function renderTodayView() {
  const container = document.getElementById("today-container");
  if (!container) return;

  const persistentClosed = await fetchPersistentClosed();
  if (persistentClosed?.isClosed) {
    renderPlaceholder(container, persistentClosed.message || "Restaurangen är stängd tillsvidare.");
    return;
  }

  const todayClosed = await fetchTodayClosed();
  if (todayClosed?.isClosed) {
    renderPlaceholder(container, todayClosed.message || "Restaurangen är stängd idag.");
    return;
  }

  const dayKey = getTodayDayKey();
  if (!dayKey) {
    renderPlaceholder(container, "Dagens lunch serveras måndag till fredag.");
    return;
  }

  const lunches = await getAllLunches();
  const weekKey = formatWeekInputValue(new Date());
  const selections = await fetchWeekSelection(weekKey);
  const lunchId = selections?.[dayKey];

  if (!lunchId) {
    renderPlaceholder(container, "Ingen lunch har lagts upp för idag ännu.");
    return;
  }

  const lunch = lunches.find(item => item.id === lunchId);
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
  await populateWeekSelect(weekPicker);
  const initialWeek = setInitialWeekValue(weekPicker);
  await drawWeek(initialWeek);

  weekPicker?.addEventListener("change", event => {
    drawWeek(event.target.value);
  });

  async function drawWeek(weekValue) {
    const weekKey = toWeekKey(weekValue);
    const lunches = await getAllLunches();
    const selections = await fetchWeekSelection(weekKey);
    section.innerHTML = "";

    WEEKDAYS.forEach(dayKey => {
      const card = document.createElement("article");
      card.className = "day-card";
      const heading = document.createElement("h3");
      heading.textContent = WEEKDAY_LABELS[dayKey];
      const content = document.createElement("div");
      content.id = `${dayKey}-weekly`;

      const lunchId = selections?.[dayKey];
      if (lunchId) {
        const lunch = lunches.find(item => item.id === lunchId);
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

async function initAdminView() {
  const loginSection = document.getElementById("admin-login");
  const loginForm = document.getElementById("login-form");
  const loginEmail = document.getElementById("admin-email");
  const loginPassword = document.getElementById("admin-pass");
  const loginError = document.getElementById("login-error");
  const panel = document.getElementById("admin-panel");
  const weekPicker = document.getElementById("week-picker");
  const weekForm = document.getElementById("week-form");
  const weekFeedback = document.getElementById("week-feedback");
  const newLunchSection = document.getElementById("new-lunch");
  const newLunchForm = document.getElementById("new-lunch-form");
  const newLunchFeedback = document.getElementById("new-lunch-feedback");
  const closedSection = document.getElementById("closed-override");
  const closedForm = document.getElementById("closed-form");
  const closedCheckbox = document.getElementById("closed-checkbox");
  const closedPersistentCheckbox = document.getElementById("closed-persistent-checkbox");
  const closedMessage = document.getElementById("closed-message");
  const closedFeedback = document.getElementById("closed-feedback");
  const logoutBtn = document.getElementById("logout-btn");
  const selects = Array.from(document.querySelectorAll("select[data-day]"));

  if (!loginSection || !loginForm || !panel) return;

  await populateWeekSelect(weekPicker);
  const initialWeek = setInitialWeekValue(weekPicker);
  await populateSelectOptions(selects);
  await applySelectionsToForm(selects, initialWeek);

  closedPersistentCheckbox.addEventListener("change", () => {
    if (closedPersistentCheckbox.checked) {
      closedCheckbox.checked = false;
      closedCheckbox.disabled = true;
    } else {
      closedCheckbox.disabled = false;
    }
  });

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    loginError.hidden = true;
    try {
      await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value.trim());
      loginPassword.value = "";
    } catch (error) {
      console.error("Inloggning misslyckades:", error);
      loginError.textContent = "Fel e-post eller lösenord.";
      loginError.hidden = false;
    }
  });

  logoutBtn?.addEventListener("click", () => {
    signOut(auth).catch(error => console.error("Kunde inte logga ut:", error));
  });

  onAuthStateChanged(auth, async user => {
    if (user) {
      loginSection.hidden = true;
      panel.hidden = false;
      newLunchSection.hidden = false;
      closedSection.hidden = false;
      await applySelectionsToForm(selects, weekPicker.value);
      await syncClosedState(closedPersistentCheckbox, closedCheckbox, closedMessage);
    } else {
      panel.hidden = true;
      newLunchSection.hidden = true;
      closedSection.hidden = true;
      loginSection.hidden = false;
    }
  });

  weekForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!auth.currentUser) {
      alert("Du måste logga in för att spara ändringar.");
      return;
    }

    const weekKey = toWeekKey(weekPicker.value);
    if (!weekKey) return;

    const payload = {};
    selects.forEach(select => {
      if (select.value) {
        payload[select.dataset.day] = select.value;
      }
    });

    try {
      await saveWeekSelection(weekKey, payload);
      showFeedback(weekFeedback);
    } catch {
      alert("Det gick inte att spara veckan. Försök igen.");
    }
  });

  weekPicker.addEventListener("change", () => {
    applySelectionsToForm(selects, weekPicker.value);
  });

  newLunchForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!auth.currentUser) {
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

    try {
      await setDoc(doc(db, "customLunches", newEntry.id), {
        title: newEntry.title,
        detail: newEntry.detail,
        allergens: newEntry.allergens,
        createdAt: serverTimestamp()
      });
      lunchesCache = null;
      await populateSelectOptions(selects, true);
      newLunchForm.reset();
      showFeedback(newLunchFeedback);
    } catch (error) {
      console.error("Kunde inte lägga till lunch:", error);
      alert("Det gick inte att spara den nya lunchen.");
    }
  });

  closedForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!auth.currentUser) {
      alert("Du måste logga in för att spara meddelandet.");
      return;
    }

    const messageText = closedMessage.value.trim();
    const persistentChecked = closedPersistentCheckbox.checked;
    const todayChecked = closedCheckbox.checked;

    try {
      if (persistentChecked) {
        await savePersistentClosed(true, messageText);
        await clearTodayClosed();
      } else {
        await savePersistentClosed(false, "");
        if (todayChecked) {
          await saveTodayClosed(messageText);
        } else {
          await clearTodayClosed();
          closedMessage.value = "";
        }
      }

      await syncClosedState(closedPersistentCheckbox, closedCheckbox, closedMessage);
      showFeedback(closedFeedback);
    } catch (error) {
      console.error("Kunde inte spara stängningsmeddelande:", error);
      alert("Det gick inte att spara meddelandet. Försök igen.");
    }
  });
}

async function syncClosedState(persistentCheckbox, todayCheckbox, messageInput) {
  const persistent = await fetchPersistentClosed(true);
  if (persistent?.isClosed) {
    persistentCheckbox.checked = true;
    todayCheckbox.checked = false;
    todayCheckbox.disabled = true;
    messageInput.value = persistent.message || "";
  } else {
    persistentCheckbox.checked = false;
    todayCheckbox.disabled = false;
    const today = await fetchTodayClosed(true);
    todayCheckbox.checked = Boolean(today?.isClosed);
    messageInput.value = today?.message || "";
  }
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

function getTodayDayKey() {
  const day = new Date().getDay();
  return WEEKDAYS[day - 1] || null;
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

function getWeekStart(date) {
  const tmp = new Date(date);
  const day = (tmp.getDay() + 6) % 7;
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

  [pastWeek, currentWeek, nextWeek].forEach(date => {
    const value = formatWeekInputValue(date);
    if (!seen.has(value)) {
      seen.add(value);
      options.push({ value, label: formatWeekLabel(date) });
    }
  });

  options.sort((a, b) => (a.value < b.value ? 1 : -1));
  return options;
}

async function populateWeekSelect(select) {
  if (!select) return;
  const options = buildWeekOptions();
  select.innerHTML = options.map(option => `<option value="${option.value}">${option.label}</option>`).join("");
}

function setInitialWeekValue(select) {
  if (!select) return "";
  const currentWeek = formatWeekInputValue(new Date());
  const fallback = select.options[0]?.value || "";
  const value = select.querySelector(`option[value="${currentWeek}"]`) ? currentWeek : fallback;
  select.value = value;
  return value;
}

async function populateSelectOptions(selects, force = false) {
  const lunches = await getAllLunches(force);
  const optionsHtml = [
    "<option value=''>— Välj lunch —</option>",
    ...lunches.map(lunch => `<option value="${lunch.id}">${lunch.title}</option>`)
  ].join("");

  selects.forEach(select => {
    const currentValue = select.value;
    select.innerHTML = optionsHtml;
    if (currentValue) {
      select.value = currentValue;
    }
  });
}

async function applySelectionsToForm(selects, weekValue) {
  const weekKey = toWeekKey(weekValue);
  const selections = await fetchWeekSelection(weekKey);
  selects.forEach(select => {
    const day = select.dataset.day;
    select.value = selections?.[day] || "";
  });
}

function showFeedback(element) {
  if (!element) return;
  element.hidden = false;
  setTimeout(() => {
    element.hidden = true;
  }, 2500);
}

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `lunch-${Date.now()}`;
}

function initContactAndDirections() {
  const contactBtn = document.getElementById("contact-btn");
  const directionsBtn = document.getElementById("directions-btn");
  const contactModal = document.getElementById("contact-modal");
  const contactModalClose = document.getElementById("contact-modal-close");

  if (contactBtn && contactModal) {
    contactBtn.addEventListener("click", () => {
      contactModal.hidden = false;
      document.body.style.overflow = "hidden";
    });
  }

  if (contactModalClose) {
    contactModalClose.addEventListener("click", () => {
      contactModal.hidden = true;
      document.body.style.overflow = "";
    });
  }

  if (contactModal) {
    const overlay = contactModal.querySelector(".modal-overlay");
    overlay?.addEventListener("click", () => {
      contactModal.hidden = true;
      document.body.style.overflow = "";
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !contactModal.hidden) {
        contactModal.hidden = true;
        document.body.style.overflow = "";
      }
    });
  }

  if (directionsBtn) {
    directionsBtn.addEventListener("click", openDirections);
  }
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function openDirections() {
  const address = encodeURIComponent(RESTAURANT_ADDRESS);
  const url = isIOS()
    ? `maps://maps.apple.com/?daddr=${address}`
    : `https://www.google.com/maps/dir/?api=1&destination=${address}`;
  window.open(url, "_blank");
}

function getIsoWeekNumber(date) {

