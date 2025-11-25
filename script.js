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
let persistentClosedCache;
let todayClosedCache;
let pricingCache;

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

function slugify(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `lunch-${Date.now()}`;
}

function normalizeLunch(lunch) {
  const id = lunch.id || slugify(lunch.title || "");
  return {
    id,
    title: lunch.title || "Okänd rätt",
    detail: lunch.detail || "",
    allergens: lunch.allergens || "",
    showSeniorPrice: lunch.showSeniorPrice !== false,
    instagramUrl: lunch.instagramUrl || ""
  };
}

async function getAllLunches(force = false) {
  if (!force && lunchesCache) return lunchesCache;

  try {
    const [baseSnap, customSnap] = await Promise.all([
      getDocs(collection(db, "lunches")),
      getDocs(collection(db, "customLunches"))
    ]);

    const base = baseSnap.docs.map(docSnap => {
      const normalized = normalizeLunch({ id: docSnap.id, ...docSnap.data() });
      return { ...normalized, collection: "lunches" };
    });
    const custom = customSnap.docs.map(docSnap => {
      const normalized = normalizeLunch({ id: docSnap.id, ...docSnap.data() });
      return { ...normalized, collection: "customLunches" };
    });
    const merged = [...base, ...custom];

    if (merged.length) {
      lunchesCache = merged;
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
      lunchesCache = Array.isArray(data)
        ? data.map(item => ({ ...normalizeLunch(item), collection: null }))
        : [];
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
  await setDoc(doc(db, "weekSelections", weekKey), payload);
  selectionCache[weekKey] = payload;
}

function getTodayDateKey() {
  return new Date().toISOString().split("T")[0];
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
    await deleteDoc(docRef).catch(() => {});
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
  await deleteDoc(doc(db, "closedOverrides", dateKey)).catch(() => {});
  todayClosedCache = null;
}

async function fetchPricing(force = false) {
  if (!force && pricingCache !== undefined) return pricingCache;
  try {
    const snap = await getDoc(doc(db, "flags", "pricing"));
    pricingCache = snap.exists() ? snap.data() : null;
    return pricingCache;
  } catch (error) {
    console.error("Kunde inte läsa prisinformation:", error);
    pricingCache = null;
    return null;
  }
}

async function savePricing(regularPrice, seniorPrice) {
  await setDoc(doc(db, "flags", "pricing"), {
    regularPrice: regularPrice || "",
    seniorPrice: seniorPrice || "",
    updatedAt: serverTimestamp()
  });
  pricingCache = { regularPrice: regularPrice || "", seniorPrice: seniorPrice || "" };
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

  const [lunches, pricing] = await Promise.all([getAllLunches(), fetchPricing()]);
  const weekKey = formatWeekInputValue(new Date());
  const selections = await fetchWeekSelection(weekKey);
  const lunchId = selections?.[dayKey];

  if (!lunchId) {
    renderPlaceholder(container, "Ingen lunch har lagts upp för idag ännu.");
    return;
  }

  const lunch = lunches.find(item => item.id === lunchId);
  if (lunch) {
    renderLunch(container, lunch, pricing, true);
    // Instagram embeds are loaded by the platform script automatically
    // Process embeds after a short delay to ensure DOM is ready
    setTimeout(() => {
      if (window.instgrm && window.instgrm.Embeds) {
        window.instgrm.Embeds.process();
      }
    }, 100);
  } else {
    renderPlaceholder(container, "Den valda rätten finns inte längre.");
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
    const [lunches, selections, persistentClosed, todayClosed, pricing] = await Promise.all([
      getAllLunches(),
      fetchWeekSelection(weekKey),
      fetchPersistentClosed(),
      fetchTodayClosed(),
      fetchPricing()
    ]);
    const currentWeekValue = formatWeekInputValue(new Date());
    const weekIsCurrent = weekValue === currentWeekValue;
    const todayKey = getTodayDayKey();
    section.innerHTML = "";

    WEEKDAYS.forEach(dayKey => {
      const card = document.createElement("article");
      card.className = "day-card";
      const heading = document.createElement("h3");
      heading.textContent = WEEKDAY_LABELS[dayKey];
      const content = document.createElement("div");

      if (persistentClosed?.isClosed) {
        content.innerHTML = `<p class="placeholder">${persistentClosed.message || "Restaurangen är stängd tillsvidare."}</p>`;
      } else if (weekIsCurrent && todayClosed?.isClosed && dayKey === todayKey) {
        content.innerHTML = `<p class="placeholder">${todayClosed.message || "Restaurangen är stängd idag."}</p>`;
      } else {
        const lunchId = selections?.[dayKey];
        if (lunchId) {
          const lunch = lunches.find(item => item.id === lunchId);
          if (lunch) {
            content.innerHTML = buildLunchMarkup(lunch, pricing);
            // Instagram embeds are loaded by the platform script automatically
            // Process embeds after a short delay to ensure DOM is ready
            setTimeout(() => {
              if (window.instgrm && window.instgrm.Embeds) {
                window.instgrm.Embeds.process();
              }
            }, 100);
          } else {
            content.innerHTML = `<p class="placeholder">Vald rätt saknas i arkivet.</p>`;
          }
        } else {
          content.innerHTML = `<p class="placeholder">Ingen lunch vald ännu.</p>`;
        }
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
  const newLunchSeniorToggle = document.getElementById("lunch-senior-visible");
  const editSection = document.getElementById("edit-lunch");
  const editForm = document.getElementById("edit-lunch-form");
  const editSelect = document.getElementById("edit-lunch-select");
  const editTitle = document.getElementById("edit-lunch-title");
  const editDetail = document.getElementById("edit-lunch-detail");
  const editAllergens = document.getElementById("edit-lunch-allergens");
  const editSeniorToggle = document.getElementById("edit-lunch-senior-visible");
  const editHelper = document.getElementById("edit-lunch-helper");
  const editFeedback = document.getElementById("edit-lunch-feedback");
  const editSaveBtn = document.getElementById("edit-save-btn");
  const editDeleteBtn = document.getElementById("edit-delete-btn");
  const editHasInstagram = document.getElementById("edit-lunch-has-instagram");
  const editInstagramUrl = document.getElementById("edit-lunch-instagram-url");
  const editInstagramLabel = document.getElementById("edit-lunch-instagram-label");
  const newLunchHasInstagram = document.getElementById("lunch-has-instagram");
  const newLunchInstagramUrl = document.getElementById("lunch-instagram-url");
  const newLunchInstagramLabel = document.getElementById("lunch-instagram-label");
  const pricingSection = document.getElementById("pricing-settings");
  const pricingForm = document.getElementById("pricing-form");
  const pricingRegularInput = document.getElementById("pricing-regular");
  const pricingSeniorInput = document.getElementById("pricing-senior");
  const pricingFeedback = document.getElementById("pricing-feedback");
  const closedSection = document.getElementById("closed-override");
  const closedForm = document.getElementById("closed-form");
  const closedCheckbox = document.getElementById("closed-checkbox");
  const closedPersistentCheckbox = document.getElementById("closed-persistent-checkbox");
  const closedMessage = document.getElementById("closed-message");
  const closedFeedback = document.getElementById("closed-feedback");
  const logoutBtn = document.getElementById("logout-btn");
  const selects = Array.from(document.querySelectorAll("select[data-day]"));
  let currentEditLunch = null;

  if (!loginSection || !loginForm || !panel) return;

  await populateWeekSelect(weekPicker);
  const initialWeek = setInitialWeekValue(weekPicker);
  await populateSelectOptions(selects);
  await applySelectionsToForm(selects, initialWeek);
  await populateEditSelect(editSelect);
  const populatePricingForm = async () => {
    if (!pricingForm) return;
    const pricing = await fetchPricing();
    if (pricingRegularInput) pricingRegularInput.value = pricing?.regularPrice || "";
    if (pricingSeniorInput) pricingSeniorInput.value = pricing?.seniorPrice || "";
  };
  await populatePricingForm();

  const resetEditForm = helperMessage => {
    if (editForm) {
      editForm.reset();
    }
    currentEditLunch = null;
    if (editHelper) {
      editHelper.textContent = helperMessage || "";
    }
    if (editSaveBtn) editSaveBtn.disabled = true;
    if (editDeleteBtn) editDeleteBtn.disabled = true;
    if (editSeniorToggle) {
      editSeniorToggle.checked = true;
      editSeniorToggle.disabled = true;
    }
    if (editHasInstagram) {
      editHasInstagram.checked = false;
      editHasInstagram.disabled = true;
    }
    if (editInstagramUrl) {
      editInstagramUrl.value = "";
      editInstagramUrl.disabled = true;
    }
    if (editInstagramLabel) {
      editInstagramLabel.style.display = "none";
    }
  };

  resetEditForm("Välj en lunch för att redigera eller ta bort den.");

  if (editHasInstagram && editInstagramLabel) {
    editHasInstagram.addEventListener("change", () => {
      editInstagramLabel.style.display = editHasInstagram.checked ? "flex" : "none";
      if (!editHasInstagram.checked && editInstagramUrl) {
        editInstagramUrl.value = "";
      }
    });
  }

  if (newLunchHasInstagram && newLunchInstagramLabel) {
    newLunchHasInstagram.addEventListener("change", () => {
      newLunchInstagramLabel.style.display = newLunchHasInstagram.checked ? "flex" : "none";
      if (!newLunchHasInstagram.checked && newLunchInstagramUrl) {
        newLunchInstagramUrl.value = "";
      }
    });
  }

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

  pricingForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!auth.currentUser) {
      alert("Du måste logga in för att spara priser.");
      return;
    }
    const regularValue = pricingRegularInput?.value.trim() || "";
    const seniorValue = pricingSeniorInput?.value.trim() || "";
    try {
      await savePricing(regularValue, seniorValue);
      showFeedback(pricingFeedback);
    } catch (error) {
      console.error("Kunde inte spara priser:", error);
      alert("Det gick inte att spara priserna. Försök igen.");
    }
  });

  editSelect?.addEventListener("change", async () => {
    if (!editSelect.value) {
      resetEditForm("Välj en lunch för att redigera eller ta bort den.");
      return;
    }
    const lunches = await getAllLunches();
    const selected = lunches.find(item => item.id === editSelect.value);
    currentEditLunch = selected || null;
    if (!selected) {
      resetEditForm("Kunde inte läsa den valda lunchen.");
      return;
    }

    if (editTitle) editTitle.value = selected.title || "";
    if (editDetail) editDetail.value = selected.detail || "";
    if (editAllergens) editAllergens.value = selected.allergens || "";
    
    const hasInstagramUrl = Boolean(selected.instagramUrl?.trim());
    if (editHasInstagram) editHasInstagram.checked = hasInstagramUrl;
    if (editInstagramUrl) editInstagramUrl.value = selected.instagramUrl || "";
    if (editInstagramLabel) editInstagramLabel.style.display = hasInstagramUrl ? "flex" : "none";

    const editable = Boolean(selected.collection);
    if (editHelper) {
      editHelper.textContent = editable
        ? selected.collection === "customLunches"
          ? "Källa: Egna luncher."
          : "Källa: Grundlistan."
        : "Denna lunch går inte att uppdatera (endast lokal fallback).";
    }
    if (editSaveBtn) editSaveBtn.disabled = !editable;
    if (editDeleteBtn) editDeleteBtn.disabled = !editable;
    if (editSeniorToggle) {
      editSeniorToggle.checked = selected.showSeniorPrice !== false;
      editSeniorToggle.disabled = !editable;
    }
    if (editHasInstagram) editHasInstagram.disabled = !editable;
    if (editInstagramUrl) editInstagramUrl.disabled = !editable;
  });

  editForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!auth.currentUser) {
      alert("Du måste logga in för att spara ändringar.");
      return;
    }
    if (!currentEditLunch || !currentEditLunch.collection) {
      alert("Den här lunchen kan inte uppdateras.");
      return;
    }

    const instagramUrl = editHasInstagram?.checked && editInstagramUrl?.value.trim() 
      ? editInstagramUrl.value.trim() 
      : "";
    
    const payload = {
      title: editTitle.value.trim(),
      detail: editDetail.value.trim(),
      allergens: editAllergens.value.trim(),
      showSeniorPrice: editSeniorToggle ? editSeniorToggle.checked : true,
      instagramUrl: instagramUrl,
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, currentEditLunch.collection, currentEditLunch.id), payload);
      lunchesCache = null;
      await populateSelectOptions(selects, true);
      await populateEditSelect(editSelect, true, currentEditLunch.id);
      const refreshed = await getAllLunches();
      currentEditLunch = refreshed.find(item => item.id === currentEditLunch.id) || null;
      if (editFeedback) editFeedback.textContent = "Ändringar sparade!";
      showFeedback(editFeedback);
    } catch (error) {
      console.error("Kunde inte uppdatera lunch:", error);
      alert("Det gick inte att spara ändringarna. Försök igen.");
    }
  });

  editDeleteBtn?.addEventListener("click", async () => {
    if (!auth.currentUser) {
      alert("Du måste logga in för att ta bort luncher.");
      return;
    }
    if (!currentEditLunch || !currentEditLunch.collection) {
      alert("Välj en lunch som kan tas bort.");
      return;
    }
    if (!confirm("Är du säker på att du vill ta bort den här lunchen?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, currentEditLunch.collection, currentEditLunch.id));
      lunchesCache = null;
      await populateSelectOptions(selects, true);
      await populateEditSelect(editSelect, true);
      resetEditForm("Lunchen togs bort.");
      editSelect.value = "";
      if (editFeedback) editFeedback.textContent = "Lunchen togs bort.";
      showFeedback(editFeedback);
    } catch (error) {
      console.error("Kunde inte ta bort lunch:", error);
      alert("Det gick inte att ta bort lunchen. Försök igen.");
    }
  });

  onAuthStateChanged(auth, async user => {
    if (user) {
      loginSection.hidden = true;
      panel.hidden = false;
      if (newLunchSection) newLunchSection.hidden = false;
      if (editSection) editSection.hidden = false;
      if (pricingSection) pricingSection.hidden = false;
      if (closedSection) closedSection.hidden = false;
      await applySelectionsToForm(selects, weekPicker.value);
      await syncClosedState(closedPersistentCheckbox, closedCheckbox, closedMessage);
      await populatePricingForm();
    } else {
      panel.hidden = true;
      if (newLunchSection) newLunchSection.hidden = true;
      if (editSection) editSection.hidden = true;
      if (pricingSection) pricingSection.hidden = true;
      if (closedSection) closedSection.hidden = true;
      loginSection.hidden = false;
      resetEditForm("Logga in för att redigera luncher.");
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
    } catch (error) {
      console.error("Kunde inte spara vecka:", error);
      alert("Det gick inte att spara veckan. Försök igen.");
    }
  });

  weekPicker.addEventListener("change", () => {
    applySelectionsToForm(selects, weekPicker.value);
  });

  newLunchForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!auth.currentUser) {
      alert("Du måste logga in för att lägga till luncher.");
      return;
    }

    const title = document.getElementById("lunch-title").value.trim();
    const detail = document.getElementById("lunch-detail").value.trim();
    const allergens = document.getElementById("lunch-allergens").value.trim();
    const showSeniorPrice = newLunchSeniorToggle ? newLunchSeniorToggle.checked : true;
    const instagramUrl = newLunchHasInstagram?.checked && newLunchInstagramUrl?.value.trim()
      ? newLunchInstagramUrl.value.trim()
      : "";
    if (!title || !detail) return;

    const newEntry = normalizeLunch({
      id: `${slugify(title)}-${Date.now().toString(36)}`,
      title,
      detail,
      allergens,
      showSeniorPrice,
      instagramUrl
    });

    try {
      await setDoc(doc(db, "customLunches", newEntry.id), {
        title: newEntry.title,
        detail: newEntry.detail,
        allergens: newEntry.allergens,
        showSeniorPrice: newEntry.showSeniorPrice,
        instagramUrl: newEntry.instagramUrl,
        createdAt: serverTimestamp()
      });
      lunchesCache = null;
      await populateSelectOptions(selects, true);
      await populateEditSelect(editSelect, true);
      newLunchForm.reset();
      if (newLunchSeniorToggle) newLunchSeniorToggle.checked = true;
      if (newLunchHasInstagram) newLunchHasInstagram.checked = false;
      if (newLunchInstagramLabel) newLunchInstagramLabel.style.display = "none";
      showFeedback(newLunchFeedback);
    } catch (error) {
      console.error("Kunde inte lägga till lunch:", error);
      alert("Det gick inte att spara den nya lunchen.");
    }
  });

  closedForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!auth.currentUser) {
      alert("Du måste logga in för att spara stängningsmeddelandet.");
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

function renderLunch(container, lunch, pricing, isTodayView = false) {
  container.classList.remove("placeholder");
  container.innerHTML = buildLunchMarkup(lunch, pricing, isTodayView);
}

function renderPlaceholder(container, message) {
  container.classList.add("placeholder");
  container.innerHTML = `<p>${message}</p>`;
}


function buildLunchMarkup(lunch, pricing, isTodayView = false) {
  const regularPrice = pricing?.regularPrice?.trim();
  const seniorPrice = pricing?.seniorPrice?.trim();
  const showSenior = lunch.showSeniorPrice !== false && Boolean(seniorPrice);
  const priceHtml = regularPrice
    ? `<div class="menu-price">
        <span class="price"><span class="price-label">Pris:</span> ${regularPrice}</span>
        ${showSenior ? `<span class="senior"><span class="price-label">Pensionärspris:</span> ${seniorPrice}</span>` : ""}
      </div>`
    : "";

  const instagramUrl = lunch.instagramUrl?.trim();
  const instagramPreview = instagramUrl
    ? `<div class="menu-instagram-preview">
        <blockquote
          class="instagram-media"
          data-instgrm-permalink="${instagramUrl}"
          data-instgrm-version="14"
          style="
            background: #fff;
            border: 0;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            margin: 0;
            max-width: 200px;
            min-width: 150px;
            padding: 0;
            width: 100%;
            transform: scale(0.3);
            transform-origin: top left;
          "
        ></blockquote>
        <div style="padding-bottom: 30%;"></div>
      </div>`
    : "";

  if (isTodayView) {
    return `
      <div class="menu-lunch-top">
        <div>
          <h2>Dagens lunch</h2>
        </div>
        <div class="menu-lunch-info-block">
          <h3>${lunch.title}</h3>
          <p class="menu-detail">${lunch.detail || "Detaljer saknas."}</p>
          <p class="tagline">${lunch.allergens ? `Allergener: ${lunch.allergens}` : "Allergeninfo saknas. "}</p>
          ${priceHtml}
        </div>
      </div>
      <div class="menu-lunch-separator"></div>
      <div class="menu-lunch-content">
        <div class="menu-lunch-image">
          ${instagramPreview || ""}
        </div>
        <div class="menu-lunch-spacer"></div>
      </div>
    `;
  }

  // Weekly view - original structure
  return `
    <div class="menu-row">
      <div class="menu-info">
        ${instagramPreview}
        <h3>${lunch.title}</h3>
        <p class="menu-detail">${lunch.detail || "Detaljer saknas."}</p>
        <p class="tagline">${lunch.allergens ? `Allergener: ${lunch.allergens}` : "Allergeninfo saknas. "}</p>
      </div>
      ${priceHtml}
    </div>
  `;
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
  const past = new Date(today);
  past.setDate(today.getDate() - 7);
  const next = new Date(today);
  next.setDate(today.getDate() + 7);

  const options = [];
  const seen = new Set();

  [past, today, next].forEach(date => {
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

async function populateEditSelect(select, force = false, selectedId) {
  if (!select) return;
  const lunches = await getAllLunches(force);
  const options = [
    "<option value=''>— Välj lunch att redigera —</option>",
    ...lunches.map(lunch => {
      const labelSuffix =
        lunch.collection === "customLunches"
          ? " (Egen)"
          : lunch.collection === "lunches"
            ? " (Grund)"
            : " (Endast lokal)";
      return `<option value="${lunch.id}">${lunch.title}${labelSuffix}</option>`;
    })
  ];
  select.innerHTML = options.join("");
  if (selectedId) {
    select.value = selectedId;
  }
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

