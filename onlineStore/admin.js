/**
 * PawHaven — Admin Portal Dashboard Controller
 * Handles authentication gatekeeping, adoptable animals, store products,
 * order processing & inventory deduction, adoption applications, and gallery photos.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  let activeSession = null;
  let currentAnimals = [];
  let currentProducts = [];
  let currentGallery = [];
  let currentOrders = [];
  let currentAdoptions = [];

  // Self-contained SVG placeholder for missing images (avoids broken network requests)
  const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23F5EFFF'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%237B33BA' font-family='sans-serif' font-weight='bold' font-size='16'%3E🐾 PawHaven%3C/text%3E%3C/svg%3E";

  // Centralized currency formatting helper for USD ($)
  function formatUsdPrice(priceVal) {
    if (typeof priceVal === "number") return `$${priceVal.toFixed(2)}`;
    if (!priceVal) return "$0.00";
    const str = String(priceVal).trim();
    const cleaned = str.replace(/\s*MXN/gi, "").replace(/[^0-9.]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? str : `$${num.toFixed(2)}`;
  }
  const formatMxnPrice = formatUsdPrice; // Compatibility alias

  // Toast Notifications
  function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span>${type === "error" ? "❌" : "✅"}</span>
      <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 10);
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function handleAuthError(err, context = "") {
    console.error(`Error in ${context}:`, err);
    const msg = err?.message || (typeof err === "string" ? err : "Unknown error occurred.");
    const lower = String(msg).toLowerCase();
    const isSessionExpired = lower.includes("jwt expired") ||
                             lower.includes("token is expired") ||
                             lower.includes("invalid refresh token") ||
                             lower.includes("session expired") ||
                             err?.status === 401;
    if (isSessionExpired) {
      showToast("Session expired. Please sign in again.", "error");
      setTimeout(() => window.location.replace("admin-login.html"), 1500);
    } else {
      showToast(msg, "error");
    }
  }

  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[m]));
  }

  // Tab Navigation Switching
  document.querySelectorAll(".admin-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".admin-tab").forEach(t => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));

      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add("active");
    });
  });

  // Verify Admin Authentication & Initialize Dashboard
  async function checkAuthAndInit() {
    if (!client) {
      window.location.replace("admin-login.html");
      return;
    }

    try {
      const { data: { session }, error } = await client.auth.getSession();
      if (error || !session || !session.user) {
        window.location.replace("admin-login.html");
        return;
      }

      const isAuthorized = await window.verifyAdminUser(session.user.id);
      if (!isAuthorized) {
        await client.auth.signOut();
        window.location.replace("admin-login.html?error=unauthorized");
        return;
      }

      activeSession = session;
      const emailBadge = document.getElementById("adminEmailBadge");
      if (emailBadge) emailBadge.textContent = session.user.email || "Authorized Admin";
      const loadingGate = document.getElementById("authLoadingGate");
      if (loadingGate) loadingGate.style.display = "none";
      const mainContent = document.getElementById("adminMainContent");
      if (mainContent) mainContent.style.display = "block";

      // Concurrently fetch all administrative datasets
      await Promise.all([
        loadAnimals(),
        loadProducts(),
        loadGallery(),
        loadOrders(),
        loadAdoptions()
      ]);

      // Direct tab navigation via URL search parameter (?tab=orders)
      const urlParams = new URLSearchParams(window.location.search);
      const initialTab = urlParams.get("tab");
      if (initialTab) {
        const targetBtn = document.querySelector(`.admin-tab[data-tab="tab-${initialTab}"]`);
        if (targetBtn) targetBtn.click();
      }

    } catch (err) {
      console.error("Dashboard initialization error:", err);
      window.location.replace("admin-login.html?error=unauthorized");
    }
  }

  if (client) {
    client.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        window.location.replace("admin-login.html");
      }
    });
  }

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      if (!client) return;
      try {
        await client.auth.signOut();
        window.location.replace("admin-login.html?message=logged_out");
      } catch (err) {
        console.error("Logout error:", err);
        window.location.replace("admin-login.html");
      }
    });
  }

  // File Upload Preview Helper
  function setupPreview(inputEl, imgEl, placeholderEl, wrapperEl) {
    if (!inputEl) return;
    inputEl.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (imgEl) {
            imgEl.src = event.target.result;
            imgEl.style.display = "block";
          }
          if (placeholderEl) placeholderEl.style.display = "none";
          if (wrapperEl) wrapperEl.style.display = "flex";
        };
        reader.readAsDataURL(file);
      } else {
        if (imgEl) {
          imgEl.src = "";
          imgEl.style.display = "none";
        }
        if (placeholderEl) placeholderEl.style.display = "block";
        if (wrapperEl) wrapperEl.style.display = "none";
      }
    });
  }

  setupPreview(
    document.getElementById("animalPhoto"),
    document.getElementById("addPhotoPreview"),
    document.getElementById("addPhotoPlaceholder")
  );
  setupPreview(
    document.getElementById("editAnimalPhoto"),
    document.getElementById("editNewPhotoPreview"),
    null,
    document.getElementById("editNewPhotoWrapper")
  );
  setupPreview(
    document.getElementById("productPhoto"),
    document.getElementById("addProductPhotoPreview"),
    document.getElementById("addProductPhotoPlaceholder")
  );
  setupPreview(
    document.getElementById("editProductPhoto"),
    document.getElementById("editProductNewPhotoPreview"),
    null,
    document.getElementById("editProductNewPhotoWrapper")
  );
  setupPreview(
    document.getElementById("galleryPhoto"),
    document.getElementById("addGalleryPhotoPreview"),
    document.getElementById("addGalleryPhotoPlaceholder"),
    document.getElementById("addGalleryPhotoWrapper")
  );

  // ==================================================
  // 1. ANIMALS SECTION (CRUD, REORDERING, TOGGLE STATUS)
  // ==================================================
  async function loadAnimals() {
    const listEl = document.getElementById("adminAnimalsList");
    if (!listEl) return;
    listEl.innerHTML = `<div class="loading-empty-state"><div class="spinner"></div><p>Fetching animal listings...</p></div>`;

    try {
      let { data, error } = await client
        .from("animals")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        const retryRes = await client
          .from("animals")
          .select("*")
          .order("created_at", { ascending: false });
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error) {
        const plainRes = await client.from("animals").select("*");
        data = plainRes.data;
        error = plainRes.error;
      }

      if (error) {
        handleAuthError(error, "loadAnimals");
        listEl.innerHTML = `<div class="loading-empty-state"><p style="color:#c62828;">Error loading animals: ${escapeHtml(error.message)}</p></div>`;
        return;
      }

      currentAnimals = (data || []).sort((a, b) => {
        const hasA = a.display_order !== undefined && a.display_order !== null && !isNaN(a.display_order) && Number(a.display_order) > 0;
        const hasB = b.display_order !== undefined && b.display_order !== null && !isNaN(b.display_order) && Number(b.display_order) > 0;
        if (hasA && hasB) return Number(a.display_order) - Number(b.display_order);
        if (hasA) return -1;
        if (hasB) return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });

      const countEl = document.getElementById("totalAnimalsCount");
      if (countEl) countEl.textContent = currentAnimals.length;
      renderAdminAnimals(currentAnimals);
    } catch (err) {
      handleAuthError(err, "loadAnimals");
    }
  }

  function formatAdminAnimalBadges(animal) {
    let type = (animal.animal_type || animal.species || "dog").toLowerCase();
    let gender = (animal.gender || "female").toLowerCase();
    if (type === "perro" || type === "perra") type = "dog";
    if (type === "gato" || type === "gata") type = "cat";
    if (gender === "macho") gender = "male";
    if (gender === "hembra") gender = "female";

    const typeLabel = type === "cat" ? "🐱 Cat" : "🐶 Dog";
    const genderLabel = gender === "male" ? "♂ Male" : "♀ Female";

    let ageText = "1 Year";
    if (animal.age_value) {
      const val = Number(animal.age_value);
      const unit = (animal.age_unit || "years").toLowerCase();
      ageText = `${val} ${unit.startsWith("month") ? (val === 1 ? "Month" : "Months") : (val === 1 ? "Year" : "Years")}`;
    } else if (animal.age) {
      ageText = animal.age;
    }

    return {
      typeGender: `${genderLabel} ${typeLabel}`,
      age: `🎂 ${ageText}`
    };
  }

  function renderAdminAnimals(animals) {
    const listEl = document.getElementById("adminAnimalsList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (animals.length === 0) {
      listEl.innerHTML = `<div class="loading-empty-state"><p>No animal listings found.</p></div>`;
      return;
    }

    animals.forEach((animal, index) => {
      const card = document.createElement("div");
      card.className = "admin-animal-card";
      card.draggable = true;
      card.dataset.index = index;
      card.dataset.id = animal.id;

      const safeImg = animal.image_url || FALLBACK_IMAGE;
      const safeName = animal.name || "Unnamed Pet";
      const safeDesc = animal.description || "No description provided.";
      const badges = formatAdminAnimalBadges(animal);
      const status = (animal.status || "available").toLowerCase();
      const isAdopted = (status === "adopted" || status === "gone");

      card.innerHTML = `
        <div class="admin-card-header-top">
          <div class="order-badge-wrapper">
            <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
            <span class="order-badge">#${index + 1}</span>
          </div>
          <div class="order-controls">
            <button type="button" class="btn-order-move btn-move-up" data-index="${index}" title="Move Up" ${index === 0 ? "disabled" : ""}>⬆</button>
            <button type="button" class="btn-order-move btn-move-down" data-index="${index}" title="Move Down" ${index === animals.length - 1 ? "disabled" : ""}>⬇</button>
          </div>
        </div>

        <img src="${safeImg}" alt="${escapeHtml(safeName)}" class="admin-animal-thumb" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
        
        <div class="admin-animal-body">
          <div class="admin-animal-header">
            <span class="admin-animal-name">${escapeHtml(safeName)}</span>
            <span class="admin-status-pill ${isAdopted ? 'status-adopted' : 'status-available'}">
              ${isAdopted ? '🏡 Adopted' : '🌸 Available'}
            </span>
          </div>

          <div class="admin-animal-sub-badges">
            <span class="admin-badge-small">${escapeHtml(badges.typeGender)}</span>
            <span class="admin-badge-small">${escapeHtml(badges.age)}</span>
          </div>

          <p class="admin-animal-desc">${escapeHtml(safeDesc)}</p>
        </div>

        <div class="admin-animal-actions">
          <button class="btn-admin secondary-btn btn-small toggle-status-btn" data-id="${animal.id}" data-current="${status}">
            ${isAdopted ? 'Mark Available' : 'Mark Adopted'}
          </button>
          <button class="btn-admin secondary-btn btn-small edit-animal-btn" data-id="${animal.id}">
            ✏️ Edit
          </button>
          <button class="btn-admin danger-btn btn-small delete-animal-btn" data-id="${animal.id}" data-name="${escapeHtml(safeName)}">
            🗑 Delete
          </button>
        </div>
      `;

      listEl.appendChild(card);
    });

    listEl.querySelectorAll(".edit-animal-btn").forEach(btn => {
      btn.addEventListener("click", () => openEditAnimalModal(btn.dataset.id));
    });

    listEl.querySelectorAll(".delete-animal-btn").forEach(btn => {
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.id, btn.dataset.name, "animal"));
    });

    listEl.querySelectorAll(".toggle-status-btn").forEach(btn => {
      btn.addEventListener("click", () => toggleAnimalStatus(btn.dataset.id, btn.dataset.current));
    });

    listEl.querySelectorAll(".btn-move-up").forEach(btn => {
      btn.addEventListener("click", () => moveItemInArray(currentAnimals, Number(btn.dataset.index), Number(btn.dataset.index) - 1, saveAnimalOrder));
    });

    listEl.querySelectorAll(".btn-move-down").forEach(btn => {
      btn.addEventListener("click", () => moveItemInArray(currentAnimals, Number(btn.dataset.index), Number(btn.dataset.index) + 1, saveAnimalOrder));
    });

    setupDragAndDrop(listEl, currentAnimals, saveAnimalOrder);
  }

  async function toggleAnimalStatus(animalId, currentStatus) {
    const newStatus = (currentStatus === "available") ? "adopted" : "available";
    try {
      const { error } = await client
        .from("animals")
        .update({ status: newStatus })
        .eq("id", animalId);

      if (error) throw error;
      showToast(`Status updated to ${newStatus === 'adopted' ? 'Adopted 🏡' : 'Available 🌸'}!`);
      await loadAnimals();
    } catch (err) {
      handleAuthError(err, "toggleAnimalStatus");
    }
  }

  async function saveAnimalOrder() {
    renderAdminAnimals(currentAnimals);
    try {
      for (let idx = 0; idx < currentAnimals.length; idx++) {
        const animal = currentAnimals[idx];
        animal.display_order = idx + 1;
        const { error } = await client
          .from("animals")
          .update({ display_order: idx + 1 })
          .eq("id", animal.id);

        if (error) {
          console.warn("Could not save display_order to DB:", error.message);
          showToast("Display order updated locally! (Run supabase_schema.sql to save permanently)");
          return;
        }
      }
      showToast("Animal display order saved successfully!");
    } catch (err) {
      console.warn("Order save error:", err);
      showToast("Order updated locally!");
    }
  }

  const addAnimalForm = document.getElementById("addAnimalForm");
  if (addAnimalForm) {
    addAnimalForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("animalName").value.trim();
      const animal_type = document.getElementById("animalType").value;
      const gender = document.getElementById("animalGender").value;
      const age_value = Number(document.getElementById("animalAgeValue").value);
      const age_unit = document.getElementById("animalAgeUnit").value;
      const description = document.getElementById("animalDescription").value.trim();
      const file = document.getElementById("animalPhoto").files[0];
      const btn = document.getElementById("submitAnimalBtn");

      if (!file) {
        showToast("Please choose a photo for the animal.", "error");
        return;
      }

      if (isNaN(age_value) || age_value < 1) {
        showToast("Please enter a valid age (positive number).", "error");
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Uploading photo...';

      try {
        const publicImageUrl = await window.uploadMediaFile(file);
        btn.innerHTML = '<span class="spinner"></span> Saving animal...';

        const nextOrder = currentAnimals.length > 0 ? (Math.max(...currentAnimals.map(a => Number(a.display_order) || 0)) + 1) : 1;

        const { error } = await client
          .from("animals")
          .insert([{
            name,
            animal_type,
            gender,
            age_value,
            age_unit,
            description,
            image_url: publicImageUrl,
            status: "available",
            display_order: nextOrder
          }]);

        if (error) throw error;

        showToast(`Animal "${name}" added successfully!`);
        addAnimalForm.reset();
        document.getElementById("animalAgeValue").value = 1;
        const preview = document.getElementById("addPhotoPreview");
        if (preview) {
          preview.src = "";
          preview.style.display = "none";
        }
        const placeholder = document.getElementById("addPhotoPlaceholder");
        if (placeholder) placeholder.style.display = "block";
        await loadAnimals();
      } catch (err) {
        handleAuthError(err, "addAnimal");
      } finally {
        btn.disabled = false;
        btn.textContent = "Add Animal Listing";
      }
    });
  }

  function filterAdminAnimals() {
    const query = (document.getElementById("adminSearchInput")?.value || "").toLowerCase().trim();
    const species = document.getElementById("adminSpeciesFilter")?.value || "all";
    const gender = document.getElementById("adminGenderFilter")?.value || "all";

    const filtered = currentAnimals.filter(a => {
      const name = (a.name || "").toLowerCase();
      const desc = (a.description || "").toLowerCase();
      const matchesQuery = !query || name.includes(query) || desc.includes(query);

      let matchesSpecies = true;
      if (species !== "all") {
        let aType = (a.animal_type || a.species || "").toLowerCase();
        if (aType === "perro") aType = "dog";
        if (aType === "gato") aType = "cat";
        if (!aType) aType = (desc.includes("cat") || desc.includes("gato") || name.includes("cat")) ? "cat" : "dog";
        matchesSpecies = (aType === species);
      }

      let matchesGender = true;
      if (gender !== "all") {
        let aGender = (a.gender || "").toLowerCase();
        if (aGender === "macho") aGender = "male";
        if (aGender === "hembra") aGender = "female";
        if (!aGender) aGender = (desc.includes("female") || desc.includes("hembra")) ? "female" : "male";
        matchesGender = (aGender === gender);
      }

      return matchesQuery && matchesSpecies && matchesGender;
    });

    renderAdminAnimals(filtered);
  }

  document.getElementById("adminSearchInput")?.addEventListener("input", filterAdminAnimals);
  document.getElementById("adminSpeciesFilter")?.addEventListener("change", filterAdminAnimals);
  document.getElementById("adminGenderFilter")?.addEventListener("change", filterAdminAnimals);
  document.getElementById("refreshAnimalsBtn")?.addEventListener("click", loadAnimals);

  // Edit Animal Modal
  const editAnimalModal = document.getElementById("editModal");
  function openEditAnimalModal(animalId) {
    const animal = currentAnimals.find(a => String(a.id) === String(animalId));
    if (!animal) return;

    document.getElementById("editAnimalId").value = animal.id;
    document.getElementById("editAnimalName").value = animal.name || "";
    document.getElementById("editAnimalType").value = (animal.animal_type || "dog").toLowerCase();
    document.getElementById("editAnimalGender").value = (animal.gender || "female").toLowerCase();
    document.getElementById("editAnimalAgeValue").value = animal.age_value ? Number(animal.age_value) : 1;
    document.getElementById("editAnimalAgeUnit").value = (animal.age_unit || "years").toLowerCase();
    document.getElementById("editAnimalStatus").value = (animal.status || "available").toLowerCase();
    document.getElementById("editAnimalDescription").value = animal.description || "";
    document.getElementById("editCurrentImageUrl").value = animal.image_url || "";
    document.getElementById("editCurrentPhotoPreview").src = animal.image_url || FALLBACK_IMAGE;

    document.getElementById("editAnimalPhoto").value = "";
    document.getElementById("editNewPhotoPreview").src = "";
    document.getElementById("editNewPhotoWrapper").style.display = "none";
    if (editAnimalModal) editAnimalModal.classList.add("active");
  }

  document.getElementById("closeEditModalBtn")?.addEventListener("click", () => editAnimalModal?.classList.remove("active"));
  document.getElementById("cancelEditBtn")?.addEventListener("click", () => editAnimalModal?.classList.remove("active"));

  document.getElementById("editAnimalForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const animalId = document.getElementById("editAnimalId").value;
    const name = document.getElementById("editAnimalName").value.trim();
    const animal_type = document.getElementById("editAnimalType").value;
    const gender = document.getElementById("editAnimalGender").value;
    const age_value = Number(document.getElementById("editAnimalAgeValue").value);
    const age_unit = document.getElementById("editAnimalAgeUnit").value;
    const status = document.getElementById("editAnimalStatus").value;
    const description = document.getElementById("editAnimalDescription").value.trim();
    const newPhotoFile = document.getElementById("editAnimalPhoto").files[0];
    let imageUrl = document.getElementById("editCurrentImageUrl").value;
    const btn = document.getElementById("saveEditBtn");

    if (isNaN(age_value) || age_value < 1) {
      showToast("Please enter a valid age.", "error");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
      if (newPhotoFile) {
        btn.innerHTML = '<span class="spinner"></span> Uploading photo...';
        imageUrl = await window.uploadMediaFile(newPhotoFile);
      }

      btn.innerHTML = '<span class="spinner"></span> Updating record...';
      const { error } = await client
        .from("animals")
        .update({
          name,
          animal_type,
          gender,
          age_value,
          age_unit,
          status,
          description,
          image_url: imageUrl
        })
        .eq("id", animalId);

      if (error) throw error;

      showToast(`Animal "${name}" updated successfully!`);
      if (editAnimalModal) editAnimalModal.classList.remove("active");
      await loadAnimals();
    } catch (err) {
      handleAuthError(err, "editAnimal");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  });

  // ==================================================
  // 2. PRODUCTS SECTION (PET SHOP & INVENTORY)
  // ==================================================
  async function loadProducts() {
    const listEl = document.getElementById("adminProductsList");
    if (!listEl) return;
    listEl.innerHTML = `<div class="loading-empty-state"><div class="spinner"></div><p>Fetching products...</p></div>`;

    try {
      let { data, error } = await client
        .from("products")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        const retryRes = await client
          .from("products")
          .select("*")
          .order("created_at", { ascending: false });
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error) {
        const plainRes = await client.from("products").select("*");
        data = plainRes.data;
        error = plainRes.error;
      }

      if (error) {
        handleAuthError(error, "loadProducts");
        listEl.innerHTML = `<div class="loading-empty-state"><p style="color:#c62828;">Error loading products: ${escapeHtml(error.message)}</p></div>`;
        return;
      }

      currentProducts = (data || []).sort((a, b) => {
        const hasA = a.display_order !== undefined && a.display_order !== null && !isNaN(a.display_order) && Number(a.display_order) > 0;
        const hasB = b.display_order !== undefined && b.display_order !== null && !isNaN(b.display_order) && Number(b.display_order) > 0;
        if (hasA && hasB) return Number(a.display_order) - Number(b.display_order);
        if (hasA) return -1;
        if (hasB) return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });

      const countEl = document.getElementById("totalProductsCount");
      if (countEl) countEl.textContent = currentProducts.length;
      renderAdminProducts(currentProducts);
    } catch (err) {
      handleAuthError(err, "loadProducts");
    }
  }

  function renderAdminProducts(products) {
    const listEl = document.getElementById("adminProductsList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (products.length === 0) {
      listEl.innerHTML = `<div class="loading-empty-state"><p>No products in store yet.</p></div>`;
      return;
    }

    products.forEach((product, index) => {
      const card = document.createElement("div");
      card.className = "admin-animal-card";
      card.draggable = true;
      card.dataset.index = index;
      card.dataset.id = product.id;

      const safeImg = product.image_url || FALLBACK_IMAGE;
      const safeName = product.name || "Product Item";
      const safePrice = formatUsdPrice(product.price);

      const hasStock = (product.stock_quantity !== null && product.stock_quantity !== undefined && !isNaN(product.stock_quantity) && product.stock_quantity !== "");
      const stock = hasStock ? Number(product.stock_quantity) : null;
      let stockBadgeHtml = "";
      if (!hasStock) {
        stockBadgeHtml = `<span class="admin-stock-badge stock-untracked">Stock: Untracked</span>`;
      } else if (stock === 0) {
        stockBadgeHtml = `<span class="admin-stock-badge stock-out">Out of Stock (0 units)</span>`;
      } else if (stock <= 4) {
        stockBadgeHtml = `<span class="admin-stock-badge stock-low">⚠️ Low Stock (${stock} left)</span>`;
      } else {
        stockBadgeHtml = `<span class="admin-stock-badge stock-ok">In Stock (${stock} units)</span>`;
      }

      card.innerHTML = `
        <div class="admin-card-header-top">
          <div class="order-badge-wrapper">
            <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
            <span class="order-badge">#${index + 1}</span>
          </div>
          <div class="order-controls">
            <button type="button" class="btn-order-move btn-move-up" data-index="${index}" title="Move Up" ${index === 0 ? "disabled" : ""}>⬆</button>
            <button type="button" class="btn-order-move btn-move-down" data-index="${index}" title="Move Down" ${index === products.length - 1 ? "disabled" : ""}>⬇</button>
          </div>
        </div>

        <img src="${safeImg}" alt="${escapeHtml(safeName)}" class="admin-animal-thumb" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
        
        <div class="admin-animal-body">
          <div class="admin-animal-header">
            <span class="admin-animal-name">${escapeHtml(safeName)}</span>
            <span class="admin-badge-small" style="color:var(--vibrant-pink); font-weight:800;">${escapeHtml(safePrice)}</span>
          </div>
          <div class="admin-stock-control-row">
            ${stockBadgeHtml}
            <button type="button" class="btn-admin secondary-btn btn-small quick-stock-btn" data-id="${product.id}" data-name="${escapeHtml(safeName)}" data-current="${stock !== null ? stock : ''}" style="width: auto; padding: 2px 8px; font-size: 11px; margin-left: auto;">
              Edit Qty
            </button>
          </div>
        </div>

        <div class="admin-animal-actions">
          <button class="btn-admin secondary-btn btn-small edit-product-btn" data-id="${product.id}">
            ✏️ Edit
          </button>
          <button class="btn-admin danger-btn btn-small delete-product-btn" data-id="${product.id}" data-name="${escapeHtml(safeName)}">
            🗑 Delete
          </button>
        </div>
      `;

      listEl.appendChild(card);
    });

    listEl.querySelectorAll(".quick-stock-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const currentVal = btn.dataset.current;
        const promptVal = prompt(`Enter available stock quantity for "${btn.dataset.name}":\n(Leave empty to mark as untracked)`, currentVal);
        if (promptVal === null) return;
        const trimmed = promptVal.trim();
        const newStock = trimmed !== "" ? Math.max(0, parseInt(trimmed, 10)) : null;
        if (trimmed !== "" && isNaN(newStock)) {
          showToast("Please enter a valid non-negative whole number.", "error");
          return;
        }
        try {
          const { error } = await client.from("products").update({ stock_quantity: newStock }).eq("id", btn.dataset.id);
          if (error) throw error;
          showToast("Stock quantity updated!");
          await loadProducts();
        } catch (err) {
          handleAuthError(err, "quickStock");
        }
      });
    });

    listEl.querySelectorAll(".edit-product-btn").forEach(btn => {
      btn.addEventListener("click", () => openEditProductModal(btn.dataset.id));
    });

    listEl.querySelectorAll(".delete-product-btn").forEach(btn => {
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.id, btn.dataset.name, "product"));
    });

    listEl.querySelectorAll(".btn-move-up").forEach(btn => {
      btn.addEventListener("click", () => moveItemInArray(currentProducts, Number(btn.dataset.index), Number(btn.dataset.index) - 1, saveProductOrder));
    });

    listEl.querySelectorAll(".btn-move-down").forEach(btn => {
      btn.addEventListener("click", () => moveItemInArray(currentProducts, Number(btn.dataset.index), Number(btn.dataset.index) + 1, saveProductOrder));
    });

    setupDragAndDrop(listEl, currentProducts, saveProductOrder);
  }

  async function saveProductOrder() {
    renderAdminProducts(currentProducts);
    try {
      for (let idx = 0; idx < currentProducts.length; idx++) {
        const product = currentProducts[idx];
        product.display_order = idx + 1;
        const { error } = await client
          .from("products")
          .update({ display_order: idx + 1 })
          .eq("id", product.id);

        if (error) {
          console.warn("Could not save product display_order to DB:", error.message);
          showToast("Product order updated locally! (Run supabase_schema.sql to save permanently)");
          return;
        }
      }
      showToast("Product display order saved successfully!");
    } catch (err) {
      console.warn("Product order save error:", err);
      showToast("Product order updated locally!");
    }
  }

  const addProductForm = document.getElementById("addProductForm");
  if (addProductForm) {
    addProductForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("productName").value.trim();
      const rawPrice = document.getElementById("productPrice").value.trim();
      const price = formatUsdPrice(rawPrice);
      const stockInput = document.getElementById("productStock")?.value.trim() || "";
      const stock_quantity = stockInput !== "" ? Math.max(0, parseInt(stockInput, 10)) : null;
      const file = document.getElementById("productPhoto").files[0];
      const btn = document.getElementById("submitProductBtn");

      if (!file) {
        showToast("Please choose a photo for the product.", "error");
        return;
      }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Uploading photo...';

      try {
        const publicImageUrl = await window.uploadMediaFile(file);
        btn.innerHTML = '<span class="spinner"></span> Saving product...';

        const nextOrder = currentProducts.length > 0 ? (Math.max(...currentProducts.map(p => Number(p.display_order) || 0)) + 1) : 1;

        const { error } = await client
          .from("products")
          .insert([{ name, price, image_url: publicImageUrl, display_order: nextOrder, stock_quantity }]);

        if (error) throw error;

        showToast(`Product "${name}" added successfully!`);
        addProductForm.reset();
        const preview = document.getElementById("addProductPhotoPreview");
        if (preview) {
          preview.src = "";
          preview.style.display = "none";
        }
        const placeholder = document.getElementById("addProductPhotoPlaceholder");
        if (placeholder) placeholder.style.display = "block";
        await loadProducts();
      } catch (err) {
        handleAuthError(err, "addProduct");
      } finally {
        btn.disabled = false;
        btn.textContent = "Add Product to Store";
      }
    });
  }

  // Edit Product Modal
  const editProductModal = document.getElementById("editProductModal");
  function openEditProductModal(productId) {
    const product = currentProducts.find(p => String(p.id) === String(productId));
    if (!product) return;

    document.getElementById("editProductId").value = product.id;
    document.getElementById("editProductName").value = product.name || "";
    document.getElementById("editProductPrice").value = product.price || "";
    document.getElementById("editProductStock").value = (product.stock_quantity !== null && product.stock_quantity !== undefined && product.stock_quantity !== "") ? product.stock_quantity : "";
    document.getElementById("editProductCurrentImageUrl").value = product.image_url || "";
    document.getElementById("editProductCurrentPhotoPreview").src = product.image_url || FALLBACK_IMAGE;

    document.getElementById("editProductPhoto").value = "";
    document.getElementById("editProductNewPhotoPreview").src = "";
    document.getElementById("editProductNewPhotoWrapper").style.display = "none";
    if (editProductModal) editProductModal.classList.add("active");
  }

  document.getElementById("closeEditProductModalBtn")?.addEventListener("click", () => editProductModal?.classList.remove("active"));
  document.getElementById("cancelEditProductBtn")?.addEventListener("click", () => editProductModal?.classList.remove("active"));

  document.getElementById("editProductForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const productId = document.getElementById("editProductId").value;
    const name = document.getElementById("editProductName").value.trim();
    const rawPrice = document.getElementById("editProductPrice").value.trim();
    const price = formatUsdPrice(rawPrice);
    const stockInput = document.getElementById("editProductStock")?.value.trim() || "";
    const stock_quantity = stockInput !== "" ? Math.max(0, parseInt(stockInput, 10)) : null;
    const newPhotoFile = document.getElementById("editProductPhoto").files[0];
    let imageUrl = document.getElementById("editProductCurrentImageUrl").value;
    const btn = document.getElementById("saveEditProductBtn");

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Saving...';

    try {
      if (newPhotoFile) {
        btn.innerHTML = '<span class="spinner"></span> Uploading photo...';
        imageUrl = await window.uploadMediaFile(newPhotoFile);
      }

      btn.innerHTML = '<span class="spinner"></span> Updating product...';
      const { error } = await client
        .from("products")
        .update({ name, price, image_url: imageUrl, stock_quantity })
        .eq("id", productId);

      if (error) throw error;

      showToast(`Product "${name}" updated successfully!`);
      if (editProductModal) editProductModal.classList.remove("active");
      await loadProducts();
    } catch (err) {
      handleAuthError(err, "editProduct");
    } finally {
      btn.disabled = false;
      btn.textContent = "Save Changes";
    }
  });

  document.getElementById("refreshProductsBtn")?.addEventListener("click", loadProducts);

  // ==================================================
  // 3. FEATURED GALLERY MANAGEMENT
  // ==================================================
  async function loadGallery() {
    const listEl = document.getElementById("adminGalleryList");
    if (!listEl) return;
    listEl.innerHTML = `<div class="loading-empty-state"><div class="spinner"></div><p>Fetching gallery photos...</p></div>`;

    try {
      let { data, error } = await client
        .from("gallery")
        .select("*")
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) {
        const retryRes = await client
          .from("gallery")
          .select("*")
          .order("created_at", { ascending: false });
        data = retryRes.data;
        error = retryRes.error;
      }

      if (error) {
        console.warn("Could not query public.gallery:", error);
        listEl.innerHTML = `<div class="loading-empty-state"><p style="color:#c62828;">Table 'gallery' not ready: ${escapeHtml(error.message)}</p></div>`;
        return;
      }

      currentGallery = (data || []).sort((a, b) => {
        const hasA = a.display_order !== undefined && a.display_order !== null && !isNaN(a.display_order) && Number(a.display_order) > 0;
        const hasB = b.display_order !== undefined && b.display_order !== null && !isNaN(b.display_order) && Number(b.display_order) > 0;
        if (hasA && hasB) return Number(a.display_order) - Number(b.display_order);
        if (hasA) return -1;
        if (hasB) return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });

      const countEl = document.getElementById("totalGalleryCount");
      if (countEl) countEl.textContent = currentGallery.length;
      renderAdminGallery(currentGallery);
    } catch (err) {
      handleAuthError(err, "loadGallery");
    }
  }

  function renderAdminGallery(items) {
    const listEl = document.getElementById("adminGalleryList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (items.length === 0) {
      listEl.innerHTML = `<div class="loading-empty-state"><p>No featured gallery photos yet. Add one above!</p></div>`;
      return;
    }

    items.forEach((item, index) => {
      const card = document.createElement("div");
      card.className = "admin-animal-card";
      card.draggable = true;
      card.dataset.index = index;
      card.dataset.id = item.id;

      const safeImg = item.image_url || FALLBACK_IMAGE;
      const safeTitle = item.title || item.caption || "Gallery Photo";

      card.innerHTML = `
        <div class="admin-card-header-top">
          <div class="order-badge-wrapper">
            <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
            <span class="order-badge">#${index + 1}</span>
          </div>
          <div class="order-controls">
            <button type="button" class="btn-order-move btn-move-up" data-index="${index}" title="Move Up" ${index === 0 ? "disabled" : ""}>⬆</button>
            <button type="button" class="btn-order-move btn-move-down" data-index="${index}" title="Move Down" ${index === items.length - 1 ? "disabled" : ""}>⬇</button>
          </div>
        </div>

        <img src="${safeImg}" alt="${escapeHtml(safeTitle)}" class="admin-animal-thumb" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
        <div class="admin-animal-body">
          <div class="admin-animal-header">
            <span class="admin-animal-name" style="font-size: 15px;">${escapeHtml(safeTitle)}</span>
          </div>
        </div>
        <div class="admin-animal-actions">
          <button class="btn-admin danger-btn btn-small delete-gallery-btn" data-id="${item.id}" data-name="${escapeHtml(safeTitle)}">
            🗑 Delete
          </button>
        </div>
      `;
      listEl.appendChild(card);
    });

    listEl.querySelectorAll(".delete-gallery-btn").forEach(btn => {
      btn.addEventListener("click", () => openDeleteModal(btn.dataset.id, btn.dataset.name, "gallery"));
    });

    listEl.querySelectorAll(".btn-move-up").forEach(btn => {
      btn.addEventListener("click", () => moveItemInArray(currentGallery, Number(btn.dataset.index), Number(btn.dataset.index) - 1, saveGalleryOrder));
    });

    listEl.querySelectorAll(".btn-move-down").forEach(btn => {
      btn.addEventListener("click", () => moveItemInArray(currentGallery, Number(btn.dataset.index), Number(btn.dataset.index) + 1, saveGalleryOrder));
    });

    setupDragAndDrop(listEl, currentGallery, saveGalleryOrder);
  }

  async function saveGalleryOrder() {
    renderAdminGallery(currentGallery);
    try {
      for (let idx = 0; idx < currentGallery.length; idx++) {
        const item = currentGallery[idx];
        item.display_order = idx + 1;
        const { error } = await client
          .from("gallery")
          .update({ display_order: idx + 1 })
          .eq("id", item.id);

        if (error) {
          console.warn("Could not save display_order to DB:", error.message);
          showToast("Display order updated locally! (Run supabase_schema.sql to save permanently)");
          return;
        }
      }
      showToast("Featured gallery photo order updated successfully!");
    } catch (err) {
      handleAuthError(err, "saveGalleryOrder");
    }
  }

  let isGalleryUploading = false;
  document.getElementById("addGalleryForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isGalleryUploading) return;

    const title = document.getElementById("galleryTitle").value.trim();
    const file = document.getElementById("galleryPhoto").files[0];
    const btn = document.getElementById("submitGalleryBtn");

    if (!file) {
      showToast("Please choose a photo to upload.", "error");
      return;
    }

    isGalleryUploading = true;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Uploading photo...';

    try {
      const publicUrl = await window.uploadMediaFile(file);
      btn.innerHTML = '<span class="spinner"></span> Saving to gallery...';

      const nextOrder = (currentGallery && currentGallery.length > 0) ? currentGallery.length + 1 : 1;

      let insertRes = await client
        .from("gallery")
        .insert([{ title, image_url: publicUrl, display_order: nextOrder }]);

      if (insertRes.error && (insertRes.error.message?.includes("display_order") || insertRes.error.code === "42703" || insertRes.error.code === "PGRST204")) {
        insertRes = await client
          .from("gallery")
          .insert([{ title, image_url: publicUrl }]);
      }

      if (insertRes.error) throw insertRes.error;

      showToast("Photo added to gallery successfully!");
      document.getElementById("addGalleryForm").reset();
      const previewEl = document.getElementById("addGalleryPhotoPreview");
      if (previewEl) {
        previewEl.src = "";
        previewEl.style.display = "none";
      }
      const placeholderEl = document.getElementById("addGalleryPhotoPlaceholder");
      if (placeholderEl) {
        placeholderEl.style.display = "block";
      }
      await loadGallery();
    } catch (err) {
      console.error("Gallery upload error:", err);
      handleAuthError(err, "addGalleryPhoto");
    } finally {
      isGalleryUploading = false;
      btn.disabled = false;
      btn.textContent = "Add Photo to Gallery";
    }
  });

  document.getElementById("refreshGalleryBtn")?.addEventListener("click", loadGallery);

  // ==================================================
  // 4. AUTHORIZED ADMINS MANAGEMENT
  // ==================================================
  const manageAdminsModal = document.getElementById("manageAdminsModal");
  const manageAdminsBtn = document.getElementById("manageAdminsBtn");
  const closeManageAdminsModalBtn = document.getElementById("closeManageAdminsModalBtn");

  if (manageAdminsBtn && manageAdminsModal) {
    manageAdminsBtn.addEventListener("click", () => {
      manageAdminsModal.classList.add("active");
      loadAdminUsers();
    });
  }

  if (closeManageAdminsModalBtn && manageAdminsModal) {
    closeManageAdminsModalBtn.addEventListener("click", () => {
      manageAdminsModal.classList.remove("active");
    });
  }

  async function loadAdminUsers() {
    const listEl = document.getElementById("adminUsersList");
    if (!listEl) return;
    listEl.innerHTML = `<div class="loading-empty-state"><div class="spinner"></div><p>Fetching authorized admins...</p></div>`;

    try {
      const { data, error } = await client
        .from("admin_users")
        .select("*");

      if (error) {
        console.warn("Could not query admin_users:", error.message);
        listEl.innerHTML = `<div style="padding: 10px; color: #c62828; font-size: 13px;">Error loading admins: ${escapeHtml(error.message)}</div>`;
        return;
      }

      if (!data || data.length === 0) {
        listEl.innerHTML = `<div style="padding: 10px; color: var(--text-muted); font-size: 13px;">No administrators registered yet.</div>`;
        return;
      }

      data.sort((a, b) => {
        if (a.created_at && b.created_at) {
          return new Date(a.created_at) - new Date(b.created_at);
        }
        return (a.email || "").localeCompare(b.email || "");
      });

      const currentUserId = activeSession?.user?.id;

      listEl.innerHTML = data.map(admin => {
        const isSelf = currentUserId && String(admin.user_id) === String(currentUserId);
        return `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: #fff; border-radius: 8px; margin-bottom: 6px; border: 1px solid var(--border-line);">
            <div>
              <div style="font-weight: 700; font-size: 13px; color: var(--text-dark);">
                ${escapeHtml(admin.email || "Admin Account")} ${isSelf ? '<span class="admin-badge-small" style="background:var(--soft-pink); color:var(--vibrant-pink); margin-left:6px;">You</span>' : ''}
              </div>
              <div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">UUID: ${escapeHtml(admin.user_id || "N/A")}</div>
            </div>
            <div>
              ${!isSelf ? `
                <button class="btn-admin danger-btn btn-small delete-admin-user-btn" data-id="${admin.id}" data-email="${escapeHtml(admin.email || 'Admin')}" style="padding: 4px 10px; font-size: 11px;">
                  Revoke
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join("");

      listEl.querySelectorAll(".delete-admin-user-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
          const adminId = btn.dataset.id;
          const adminEmail = btn.dataset.email;
          if (!confirm(`Are you sure you want to revoke administrative access for ${adminEmail}?`)) return;
          try {
            btn.disabled = true;
            const { error: delErr } = await client
              .from("admin_users")
              .delete()
              .eq("id", adminId);
            if (delErr) throw delErr;
            showToast(`Administrative access revoked for ${adminEmail}.`);
            await loadAdminUsers();
          } catch (err) {
            handleAuthError(err, "revokeAdmin");
          }
        });
      });
    } catch (err) {
      handleAuthError(err, "loadAdminUsers");
    }
  }

  document.getElementById("addAdminUserForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("newAdminEmail").value.trim();
    const userId = document.getElementById("newAdminUserId").value.trim();
    const btn = document.getElementById("addAdminUserBtn");

    if (!email || !userId) {
      showToast("Please provide both email and user UUID.", "error");
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Authorizing...';

    try {
      const { error } = await client
        .from("admin_users")
        .insert([{ email, user_id: userId }]);

      if (error) throw error;

      showToast(`Admin privileges granted to ${email}!`);
      document.getElementById("addAdminUserForm").reset();
      await loadAdminUsers();
    } catch (err) {
      handleAuthError(err, "addAdminUser");
    } finally {
      btn.disabled = false;
      btn.textContent = "Authorize Administrator";
    }
  });

  // ==================================================
  // 5. DRAG-AND-DROP REORDERING UTILITIES
  // ==================================================
  function setupDragAndDrop(containerEl, itemsArray, onOrderChanged) {
    let draggedItem = null;

    containerEl.querySelectorAll(".admin-animal-card").forEach(card => {
      card.addEventListener("dragstart", (e) => {
        draggedItem = card;
        e.dataTransfer.effectAllowed = "move";
        card.classList.add("dragging");
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        draggedItem = null;
      });

      card.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        card.classList.add("drag-over");
      });

      card.addEventListener("dragleave", () => {
        card.classList.remove("drag-over");
      });

      card.addEventListener("drop", (e) => {
        e.preventDefault();
        card.classList.remove("drag-over");
        if (!draggedItem || draggedItem === card) return;

        const fromIdx = Number(draggedItem.dataset.index);
        const toIdx = Number(card.dataset.index);
        if (isNaN(fromIdx) || isNaN(toIdx)) return;

        const moved = itemsArray.splice(fromIdx, 1)[0];
        itemsArray.splice(toIdx, 0, moved);
        onOrderChanged(itemsArray);
      });
    });
  }

  function moveItemInArray(itemsArray, fromIndex, toIndex, onOrderChanged) {
    if (toIndex < 0 || toIndex >= itemsArray.length) return;
    const moved = itemsArray.splice(fromIndex, 1)[0];
    itemsArray.splice(toIndex, 0, moved);
    onOrderChanged(itemsArray);
  }

  // ==================================================
  // 6. SHARED DELETE MODAL
  // ==================================================
  const deleteModal = document.getElementById("deleteModal");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

  function openDeleteModal(id, name, type) {
    document.getElementById("deleteItemId").value = id;
    document.getElementById("deleteItemType").value = type;
    document.getElementById("deleteItemName").textContent = `"${name}"`;
    if (deleteModal) deleteModal.classList.add("active");
  }

  function closeDeleteModal() {
    if (deleteModal) deleteModal.classList.remove("active");
  }

  document.getElementById("cancelDeleteBtn")?.addEventListener("click", closeDeleteModal);

  confirmDeleteBtn?.addEventListener("click", async () => {
    const id = document.getElementById("deleteItemId").value;
    const type = document.getElementById("deleteItemType").value;

    if (!id || !type) return;

    confirmDeleteBtn.disabled = true;
    confirmDeleteBtn.innerHTML = '<span class="spinner"></span> Deleting...';

    try {
      const tables = {
        animal: "animals",
        product: "products",
        gallery: "gallery",
        adoption: "adoption_requests",
        order: "orders"
      };

      const tableName = tables[type];
      if (!tableName) {
        throw new Error(`Unknown item type "${type}". Cannot delete this item.`);
      }

      const { error } = await client
        .from(tableName)
        .delete()
        .eq("id", id);

      if (error) throw error;

      showToast("Item deleted successfully.");
      closeDeleteModal();

      if (type === "animal") await loadAnimals();
      if (type === "product") await loadProducts();
      if (type === "gallery") await loadGallery();
      if (type === "adoption") await loadAdoptions();
      if (type === "order") await loadOrders();

    } catch (err) {
      console.error("Delete error:", err);
      handleAuthError(err, `deleteItem (${type})`);
    } finally {
      confirmDeleteBtn.disabled = false;
      confirmDeleteBtn.textContent = "Delete Permanently";
    }
  });

  // Close modals when clicking backdrop
  window.addEventListener("click", (e) => {
    if (e.target === editAnimalModal) editAnimalModal.classList.remove("active");
    if (e.target === editProductModal) editProductModal.classList.remove("active");
    if (e.target === manageAdminsModal) manageAdminsModal.classList.remove("active");
    if (e.target === deleteModal) closeDeleteModal();
  });

  // ==================================================
  // 7. ORDERS MANAGEMENT & ATOMIC INVENTORY DEDUCTION
  // ==================================================
  async function loadOrders() {
    const listEl = document.getElementById("adminOrdersList");
    if (!listEl) return;
    listEl.innerHTML = `<div class="loading-empty-state"><div class="spinner"></div><p>Fetching shop orders...</p></div>`;

    try {
      const { data, error } = await client
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Could not query orders:", error.message);
        listEl.innerHTML = `<div class="loading-empty-state"><p style="color:var(--text-muted);">Orders table not accessible. Please run schema in Supabase.</p></div>`;
        return;
      }

      currentOrders = data || [];
      const ordersBadge = document.getElementById("totalOrdersCount") || document.getElementById("ordersCounterBadge");
      if (ordersBadge) ordersBadge.textContent = currentOrders.length;
      const innerOrders = document.getElementById("ordersCounterBadgeInner");
      if (innerOrders) innerOrders.textContent = currentOrders.length;
      filterAndRenderOrders();
    } catch (err) {
      console.error("loadOrders error:", err);
      listEl.innerHTML = `<div class="loading-empty-state"><p>No shop orders found.</p></div>`;
    }
  }

  function filterAndRenderOrders() {
    const query = (document.getElementById("orderSearchInput")?.value || "").toLowerCase().trim();
    const statusFilter = document.getElementById("orderStatusFilter")?.value || "all";

    const filtered = currentOrders.filter(order => {
      const name = (order.customer_name || "").toLowerCase();
      const ref = (order.reference_no || "").toLowerCase();
      const phone = (order.customer_phone || "").toLowerCase();

      const matchesQuery = !query || name.includes(query) || ref.includes(query) || phone.includes(query);
      const matchesStatus = (statusFilter === "all") || ((order.status || "pending").toLowerCase() === statusFilter);

      return matchesQuery && matchesStatus;
    });

    renderAdminOrders(filtered);
  }

  function renderAdminOrders(orders) {
    const listEl = document.getElementById("adminOrdersList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (orders.length === 0) {
      listEl.innerHTML = `<div class="loading-empty-state"><p>No matching shop orders found.</p></div>`;
      return;
    }

    orders.forEach(order => {
      const card = document.createElement("div");
      card.className = "admin-order-card";
      const refNo = order.reference_no || ("ORD-" + (order.id ? order.id.substring(0, 8) : "REF"));
      const dateStr = order.created_at ? new Date(order.created_at).toLocaleString() : "Recently";
      const status = (order.status || "pending").toLowerCase();
      let items = order.items;
      if (typeof items === "string") {
        try { items = JSON.parse(items); } catch(e) { items = []; }
      }
      if (!Array.isArray(items)) items = [];
      const totalFormatted = formatUsdPrice(order.total_amount);

      let itemsRows = items.map(item => `
        <tr>
          <td><strong>${escapeHtml(item.product_name || item.name || "Product")}</strong></td>
          <td>${item.quantity || 1}x</td>
          <td>${escapeHtml(formatUsdPrice(item.unit_price))}</td>
          <td><strong>${escapeHtml(formatUsdPrice(item.subtotal))}</strong></td>
        </tr>
      `).join("");

      if (!itemsRows) {
        itemsRows = `<tr><td colspan="4" style="color:var(--text-muted);">No line item details recorded.</td></tr>`;
      }

      card.innerHTML = `
        <div class="request-card-header">
          <div class="request-ref-badge">
            🛍️ <span>Order: ${escapeHtml(refNo)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="request-date">📅 ${escapeHtml(dateStr)}</span>
            <span class="request-status-pill status-${status}">${escapeHtml(status)}</span>
          </div>
        </div>

        <div class="request-details-grid">
          <div class="request-info-box">
            <span style="font-weight: 800; color: var(--main-purple); margin-bottom: 4px;">👤 Customer Details</span>
            <div><strong>Name:</strong> ${escapeHtml(order.customer_name || "N/A")}</div>
            <div><strong>Phone / WhatsApp:</strong> ${escapeHtml(order.customer_phone || "N/A")}</div>
            <div><strong>Delivery Address:</strong> ${escapeHtml(order.delivery_address || "N/A")}, ${escapeHtml(order.city || "")}</div>
            <div><strong>Additional Information:</strong> ${order.notes ? escapeHtml(order.notes) : '<em style="color:var(--text-muted);">None provided</em>'}</div>
          </div>

          <div class="request-info-box">
            <span style="font-weight: 800; color: var(--main-purple); margin-bottom: 4px;">📦 Ordered Items (${items.length})</span>
            <div class="order-items-table-container">
              <table class="order-items-table">
                <thead>
                  <tr><th>Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
                </thead>
                <tbody>${itemsRows}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="order-total-row">
          <span>Total Order Amount:</span>
          <span class="order-total-amount">${escapeHtml(totalFormatted)}</span>
        </div>

        <div class="request-card-actions">
          <div class="request-status-actions">
            <span style="font-size: 12px; font-weight: 700; color: var(--text-muted);">Update Status:</span>
            <button type="button" class="btn-status-change" data-id="${order.id}" data-status="pending">⏳ Pending</button>
            <button type="button" class="btn-status-change" data-id="${order.id}" data-status="confirmed">✅ Confirmed</button>
            <button type="button" class="btn-status-change" data-id="${order.id}" data-status="delivered">🚚 Delivered</button>
            <button type="button" class="btn-status-change" data-id="${order.id}" data-status="cancelled">❌ Cancelled</button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${order.customer_phone ? `
              <a href="https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello ' + (order.customer_name || '') + '! This is PawHaven reaching out regarding your store order ' + refNo + '.')}" target="_blank" rel="noopener noreferrer" class="btn-admin secondary-btn btn-small">
                Chat on WhatsApp 💬
              </a>
            ` : ""}
            <button
              type="button"
              class="btn-admin danger-btn btn-small delete-order-btn"
              data-id="${order.id}"
              data-name="${escapeHtml(refNo)}">
              🗑️ Delete Order
            </button>
          </div>
        </div>
      `;

      listEl.appendChild(card);
    });

    listEl.querySelectorAll(".delete-order-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        openDeleteModal(btn.dataset.id, btn.dataset.name, "order");
      });
    });

    listEl.querySelectorAll(".btn-status-change").forEach(btn => {
      btn.addEventListener("click", async () => {
        const orderId = btn.dataset.id;
        const newStatus = btn.dataset.status;
        const order = currentOrders.find(o => String(o.id) === String(orderId));
        if (!order) return;

        const currentStatus = (order.status || "pending").toLowerCase();
        if (currentStatus === newStatus.toLowerCase()) {
          showToast(`Order is already marked as "${newStatus}".`);
          return;
        }

        try {
          btn.disabled = true;

          if (newStatus === "delivered") {
            const { data, error } = await client.rpc("deliver_order", { p_order_id: orderId });
            if (error) {
              if (error.code === "PGRST202" || error.code === "42883" || error.message?.includes("deliver_order")) {
                throw new Error("RPC 'deliver_order' not found in database. Run supabase_schema.sql in Supabase SQL Editor to enable atomic stock delivery.");
              }
              throw error;
            }
            showToast(data?.message || "Order delivered and inventory stock deducted successfully!");
          } else {
            let updated = false;
            try {
              const { data, error } = await client.rpc("update_order_status", {
                p_order_id: orderId,
                p_new_status: newStatus
              });
              if (!error) {
                updated = true;
                showToast(data?.message || `Order status updated to "${newStatus}"!`);
              } else if (error.code !== "PGRST202" && error.code !== "42883" && !error.message?.includes("update_order_status")) {
                throw error;
              }
            } catch (rpcErr) {
              if (rpcErr.code !== "PGRST202" && rpcErr.code !== "42883" && !rpcErr.message?.includes("update_order_status")) {
                throw rpcErr;
              }
            }

            if (!updated) {
              const { error } = await client
                .from("orders")
                .update({ status: newStatus })
                .eq("id", orderId);

              if (error) throw error;
              showToast(`Order status updated to "${newStatus}"!`);
            }
          }

          await loadOrders();
          if (newStatus === "delivered") {
            await loadProducts();
          }
        } catch (err) {
          console.error("Order status update failed:", err);
          handleAuthError(err, "updateOrderStatus");
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  document.getElementById("refreshOrdersBtn")?.addEventListener("click", loadOrders);
  document.getElementById("orderSearchInput")?.addEventListener("input", filterAndRenderOrders);
  document.getElementById("orderStatusFilter")?.addEventListener("change", filterAndRenderOrders);

  // ==================================================
  // 8. ADOPTION APPLICATIONS LOGIC
  // ==================================================
  async function loadAdoptions() {
    const listEl = document.getElementById("adminAdoptionsList");
    if (!listEl) return;
    listEl.innerHTML = `<div class="loading-empty-state"><div class="spinner"></div><p>Fetching adoption applications...</p></div>`;

    try {
      const { data, error } = await client
        .from("adoption_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.warn("Could not query adoption_requests:", error.message);
        listEl.innerHTML = `<div class="loading-empty-state"><p style="color:var(--text-muted);">Adoption table not accessible. Please run schema in Supabase.</p></div>`;
        return;
      }

      currentAdoptions = data || [];
      const adoptionsBadge = document.getElementById("totalAdoptionsCount") || document.getElementById("adoptionsCounterBadge");
      if (adoptionsBadge) adoptionsBadge.textContent = currentAdoptions.length;
      const innerAdoptions = document.getElementById("adoptionsCounterBadgeInner");
      if (innerAdoptions) innerAdoptions.textContent = currentAdoptions.length;
      filterAndRenderAdoptions();
    } catch (err) {
      console.error("loadAdoptions error:", err);
      listEl.innerHTML = `<div class="loading-empty-state"><p>No adoption applications found.</p></div>`;
    }
  }

  function filterAndRenderAdoptions() {
    const query = (document.getElementById("adoptionSearchInput")?.value || "").toLowerCase().trim();
    const statusFilter = document.getElementById("adoptionStatusFilter")?.value || "all";

    const filtered = currentAdoptions.filter(adp => {
      const name = (adp.applicant_name || "").toLowerCase();
      const ref = (adp.reference_no || "").toLowerCase();
      const phone = (adp.applicant_phone || "").toLowerCase();
      const email = (adp.applicant_email || "").toLowerCase();

      const matchesQuery = !query || name.includes(query) || ref.includes(query) || phone.includes(query) || email.includes(query);
      const matchesStatus = (statusFilter === "all") || ((adp.status || "pending").toLowerCase() === statusFilter);

      return matchesQuery && matchesStatus;
    });

    renderAdminAdoptions(filtered);
  }

  function renderAdminAdoptions(adoptions) {
    const listEl = document.getElementById("adminAdoptionsList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (adoptions.length === 0) {
      listEl.innerHTML = `<div class="loading-empty-state"><p>No matching adoption applications found.</p></div>`;
      return;
    }

    adoptions.forEach(adp => {
      const card = document.createElement("div");
      card.className = "admin-adoption-card";
      const refNo = adp.reference_no || ("ADP-" + (adp.id ? adp.id.substring(0, 8) : "REF"));
      const dateStr = adp.created_at ? new Date(adp.created_at).toLocaleString() : "Recently";
      const status = (adp.status || "pending").toLowerCase();
      const animals = Array.isArray(adp.animals) ? adp.animals : [];

      let animalsChips = animals.map(an => `
        <div class="adoption-animal-chip">
          <img src="${an.image_url || FALLBACK_IMAGE}" class="adoption-animal-chip-thumb" onerror="this.onerror=null;this.src='${FALLBACK_IMAGE}'">
          <div>
            <div class="adoption-animal-chip-name">${escapeHtml(an.name || an.animal_name || "Rescue Pet")}</div>
            <div class="adoption-animal-chip-meta">${escapeHtml(an.animal_type || an.species || "Animal")}</div>
          </div>
        </div>
      `).join("");

      if (!animalsChips) {
        animalsChips = `<p style="color:var(--text-muted); font-size:12px;">No animals specifically listed.</p>`;
      }

      card.innerHTML = `
        <div class="request-card-header">
          <div class="request-ref-badge">
            🐾 <span>Adoption: ${escapeHtml(refNo)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="request-date">📅 ${escapeHtml(dateStr)}</span>
            <span class="request-status-pill status-${status}">${escapeHtml(status)}</span>
          </div>
        </div>

        <div class="request-details-grid">
          <div class="request-info-box">
            <span style="font-weight: 800; color: var(--main-purple); margin-bottom: 4px;">👤 Applicant Information</span>
            <div><strong>Full Name:</strong> ${escapeHtml(adp.applicant_name || "N/A")}</div>
            ${adp.applicant_email ? `<div><strong>Email:</strong> ${escapeHtml(adp.applicant_email)}</div>` : ""}
            <div><strong>Phone / WhatsApp:</strong> ${escapeHtml(adp.applicant_phone || "N/A")}</div>
            <div><strong>Address:</strong> ${escapeHtml(adp.address || "N/A")}, ${escapeHtml(adp.city || "")}</div>
            ${adp.housing_type ? `<div><strong>Housing:</strong> ${escapeHtml(adp.housing_type)}</div>` : ""}
            ${adp.notes ? `<div><strong>Applicant Notes:</strong> <em>${escapeHtml(adp.notes)}</em></div>` : ""}
          </div>

          <div class="request-info-box">
            <span style="font-weight: 800; color: var(--main-purple); margin-bottom: 4px;">🐶 Selected Animals (${animals.length})</span>
            <div class="adoption-animals-list">${animalsChips}</div>
          </div>
        </div>

        <div class="request-card-actions">
          <div class="request-status-actions">
            <span style="font-size: 12px; font-weight: 700; color: var(--text-muted);">Update Status:</span>
            <button type="button" class="btn-status-change" data-id="${adp.id}" data-status="pending">⏳ Pending</button>
            <button type="button" class="btn-status-change" data-id="${adp.id}" data-status="reviewing">🔍 Under Review</button>
            <button type="button" class="btn-status-change" data-id="${adp.id}" data-status="approved">🎉 Approved</button>
            <button type="button" class="btn-status-change" data-id="${adp.id}" data-status="rejected">❌ Rejected</button>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            ${adp.applicant_phone ? `
              <a href="https://wa.me/${adp.applicant_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hello ' + (adp.applicant_name || '') + '! This is PawHaven reaching out regarding your adoption application ' + refNo + '.')}" target="_blank" rel="noopener noreferrer" class="btn-admin secondary-btn btn-small">
                Chat on WhatsApp 💬
              </a>
            ` : ""}
            <button
              type="button"
              class="btn-admin danger-btn btn-small delete-adoption-btn"
              data-id="${adp.id}"
              data-name="${escapeHtml(adp.applicant_name || refNo)}">
              🗑️ Delete Request
            </button>
          </div>
        </div>
      `;

      listEl.appendChild(card);
    });

    listEl.querySelectorAll(".delete-adoption-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        openDeleteModal(btn.dataset.id, btn.dataset.name, "adoption");
      });
    });

    listEl.querySelectorAll(".btn-status-change").forEach(btn => {
      btn.addEventListener("click", async () => {
        const adpId = btn.dataset.id;
        const newStatus = btn.dataset.status;
        try {
          btn.disabled = true;
          const { error } = await client.from("adoption_requests").update({ status: newStatus }).eq("id", adpId);
          if (error) throw error;
          showToast(`Adoption status updated to "${newStatus}"!`);
          await loadAdoptions();
        } catch (err) {
          handleAuthError(err, "updateAdoptionStatus");
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  document.getElementById("refreshAdoptionsBtn")?.addEventListener("click", loadAdoptions);
  document.getElementById("adoptionSearchInput")?.addEventListener("input", filterAndRenderAdoptions);
  document.getElementById("adoptionStatusFilter")?.addEventListener("change", filterAndRenderAdoptions);

  // Run authorization check and initialize
  await checkAuthAndInit();
});
