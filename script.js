/**
 * PawHaven — Public Website JavaScript
 * Handles Supabase data fetching, resilient database fallbacks,
 * interactive rotating gallery with thumbnail sync, filter controls,
 * animal badges, pet shop display, albums, and video/lightbox viewer.
 */

let loadedAnimals = [];
let loadedProducts = [];
let loadedAlbums = [];
let galleryItemsList = [];
let currentGalleryIndex = 0;
let galleryAutoPlayTimer = null;
let currentLightboxAlbum = null;
let currentLightboxIndex = 0;

const GALLERY_INTERVAL = 4000;
window.GALLERY_INTERVAL = GALLERY_INTERVAL;

const CART_STORAGE_KEY = "pawhaven_cart_v1";
let cartState = {
  products: [],
  animals: []
};

const FALLBACK_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect width='400' height='300' fill='%23F5EFFF'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%237B33BA' font-family='sans-serif' font-weight='bold' font-size='16'%3E🐾 PawHaven%3C/text%3E%3C/svg%3E";

// Default fallback data for offline or initial load
const defaultProductsData = [
  {
    id: "chain-1",
    name: "Heavy Duty Lead & Collar Set",
    price: "$18.00",
    image_url: "images/pet-shop-supplies.png"
  },
  {
    id: "toy-1",
    name: "Interactive Pet Play Toy",
    price: "$12.00",
    image_url: "images/pet-shop-supplies.png"
  },
  {
    id: "collar-1",
    name: "Adjustable Padded Harness",
    price: "$15.00",
    image_url: "images/pet-shop-supplies.png"
  }
];

const defaultGalleryData = [
  { image_url: "images/pet-adoption-showcase.png", title: "Rescued Pup Finding Hope" },
  { image_url: "images/pet-shop-supplies.png", title: "Community Pet Support" },
  { image_url: "images/logo.svg", title: "Our Rescue & Care Mission" }
];

const defaultAlbumsData = [
  {
    id: "default-album-1",
    title: "Featured Moments & Rescue Activities ✨",
    description: "Moments captured during rescue missions, medical care, and successful pet adoptions.",
    display_order: 1,
    media: [
      { id: "m1", media_type: "image", media_url: "images/pet-adoption-showcase.png", caption: "Rescued Pup Finding Hope" },
      { id: "m2", media_type: "image", media_url: "images/pet-shop-supplies.png", caption: "Community Pet Support" },
      { id: "m3", media_type: "image", media_url: "images/logo.svg", caption: "Our Rescue & Care Mission" }
    ]
  }
];

document.addEventListener("DOMContentLoaded", () => {
  // Render fallback products & rotating gallery immediately
  renderProducts(defaultProductsData);
  renderGallery(defaultGalleryData);

  // Fetch live dynamic data from Supabase
  fetchAnimalsFromSupabase();
  fetchProductsFromSupabase();
  fetchGalleryFromSupabase();
  fetchAlbumsFromSupabase();

  const yearEl = document.getElementById("copyright-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Filters event listeners
  document.getElementById("searchInput")?.addEventListener("input", filterAnimals);
  document.getElementById("speciesFilter")?.addEventListener("change", filterAnimals);
  document.getElementById("genderFilter")?.addEventListener("change", filterAnimals);
  document.getElementById("statusFilter")?.addEventListener("change", filterAnimals);

  // Setup Lightbox event listeners
  setupLightboxListeners();

  // Initialize shared Cart & Adoption Basket
  initCartAndRequestBasket();

  // Initialize mobile navigation toggle & accessibility
  initMobileNavigation();
});

// ==============================================================================
// 1. ANIMALS SECTION (Resilient Supabase Query, Badges, Filters)
// ==============================================================================

/**
 * Loads animals from Supabase public.animals table
 * Resilient to missing display_order column
 */
async function fetchAnimalsFromSupabase() {
  const grid = document.getElementById("dogsGrid");
  if (!grid) return;

  grid.innerHTML = `
    <div class="gallery-loading-state">
      <div class="spinner"></div>
      <p>Loading rescue animals looking for homes... 🐾</p>
    </div>
  `;

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) {
    setTimeout(fetchAnimalsFromSupabase, 300);
    return;
  }

  try {
    // 1. Try querying ordered by display_order, then created_at
    let { data, error } = await client
      .from("animals")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    // 2. If display_order column doesn't exist, retry ordering by created_at
    if (error) {
      console.warn("Retrying animals query ordered by created_at:", error.message);
      const retryRes = await client
        .from("animals")
        .select("*")
        .order("created_at", { ascending: false });
      data = retryRes.data;
      error = retryRes.error;
    }

    // 3. Fallback to basic query if needed
    if (error) {
      console.warn("Retrying basic animals query:", error.message);
      const plainRes = await client.from("animals").select("*");
      data = plainRes.data;
      error = plainRes.error;
    }

    if (error) {
      console.warn("Could not query public.animals:", error);
      grid.innerHTML = `
        <div class="gallery-loading-state">
          <p style="color: #c62828;">Unable to load animal listings: ${escapeHtml(error.message)}</p>
          <button class="btn-primary pink-btn" onclick="fetchAnimalsFromSupabase()" style="margin-top: 15px; cursor: pointer; border: none;">
            Retry ↻
          </button>
        </div>
      `;
      return;
    }

    // Client-side sorting: prioritize display_order if set, otherwise created_at
    const sorted = (data || []).sort((a, b) => {
      const hasA = a.display_order !== undefined && a.display_order !== null && !isNaN(a.display_order) && Number(a.display_order) > 0;
      const hasB = b.display_order !== undefined && b.display_order !== null && !isNaN(b.display_order) && Number(b.display_order) > 0;
      if (hasA && hasB) return Number(a.display_order) - Number(b.display_order);
      if (hasA) return -1;
      if (hasB) return 1;
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    loadedAnimals = sorted;

    if (loadedAnimals.length === 0) {
      grid.innerHTML = `
        <div class="gallery-loading-state">
          <p>No animals are currently listed for adoption. Check back soon! 🌸</p>
        </div>
      `;
      return;
    }

    // Apply current filter selection
    filterAnimals();

  } catch (err) {
    console.error("Unexpected error querying Supabase:", err);
    grid.innerHTML = `
      <div class="gallery-loading-state">
        <p style="color: #c62828;">Network error loading animals.</p>
        <button class="btn-primary pink-btn" onclick="fetchAnimalsFromSupabase()" style="margin-top: 15px; cursor: pointer; border: none;">
          Retry ↻
        </button>
      </div>
    `;
  }
}

/**
 * Formats animal type and gender badge text
 */
function formatTypeGenderBadge(animal) {
  let type = String(
    animal.animal_type || animal.species || ""
  ).trim().toLowerCase();

  let gender = String(animal.gender || "")
    .trim()
    .toLowerCase();

  // Normalize animal type
  if (["cat", "cats", "gato", "gata"].includes(type)) {
    type = "cat";
  } else if (["dog", "dogs", "perro", "perra"].includes(type)) {
    type = "dog";
  }

  // Normalize gender
  if (["male", "m", "macho"].includes(gender)) {
    gender = "male";
  } else if (["female", "f", "hembra"].includes(gender)) {
    gender = "female";
  }

  const typeLabel =
    type === "cat" ? "Cat" : type === "dog" ? "Dog" : "Animal";

  const genderLabel =
    gender === "male" ? "Male" :
    gender === "female" ? "Female" : "";

  const icon =
    type === "cat" ? "🐱" :
    type === "dog" ? "🐶" : "🐾";

  return `${icon} ${genderLabel} ${typeLabel}`.trim();
}

/**
 * Formats animal age badge text
 */
function formatAgeBadge(animal) {
  if (animal.age_value !== undefined && animal.age_value !== null && animal.age_value !== "") {
    const val = Number(animal.age_value);
    const unit = (animal.age_unit || "years").toLowerCase();
    if (!isNaN(val) && val > 0) {
      if (unit.startsWith("month") || unit.startsWith("mes")) {
        return `🎂 ${val} ${val === 1 ? "Month" : "Months"}`;
      } else {
        return `🎂 ${val} ${val === 1 ? "Year" : "Years"}`;
      }
    }
  }

  // Check legacy age string
  if (animal.age) {
    return `🎂 ${animal.age}`;
  }

  return "🎂 Age unknown";
}

/**
 * Renders animal cards with overlaid badges and direct WhatsApp adoption button
 */
function renderAnimals(animals) {
  const grid = document.getElementById("dogsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (!animals || animals.length === 0) {
    grid.innerHTML = `
      <div class="gallery-loading-state">
        <p>No animals match your selected filters. Try adjusting your search! 🐾</p>
      </div>
    `;
    return;
  }

  animals.forEach(animal => {
    const card = document.createElement("div");
    card.className = "dog-card";

    const imageUrl = animal.image_url || animal.image || FALLBACK_IMAGE;
    const name = animal.name ? animal.name : "Friendly Rescue";
    const desc = animal.description || animal.desc || "Loving rescue animal looking for a forever home.";
    const status = (animal.status || "available").toLowerCase();
    const isAdopted = (status === "adopted" || status === "gone" || status === "adoptado");

    // 1. Gender & Animal Type details
    let rawType = String(animal.animal_type || animal.species || "").trim().toLowerCase();
    if (["cat", "cats", "gato", "gata"].includes(rawType)) rawType = "cat";
    else if (["dog", "dogs", "perro", "perra"].includes(rawType)) rawType = "dog";
    else rawType = "animal";

    let rawGender = String(animal.gender || "").trim().toLowerCase();
    if (["male", "m", "macho"].includes(rawGender)) rawGender = "male";
    else if (["female", "f", "hembra"].includes(rawGender)) rawGender = "female";
    else rawGender = "";

    const typeLabel = rawType === "cat" ? "Cat" : rawType === "dog" ? "Dog" : "Animal";
    const genderLabel = rawGender === "male" ? "Male" : rawGender === "female" ? "Female" : "";
    const typeIcon = rawType === "cat" ? "🐱" : rawType === "dog" ? "🐶" : "🐾";

    // 2. Age details
    let fullAgeText = "Age unknown";
    let compactAgeText = "Unknown";
    if (animal.age_value !== undefined && animal.age_value !== null && animal.age_value !== "") {
      const val = Number(animal.age_value);
      const unit = (animal.age_unit || "years").toLowerCase();
      if (!isNaN(val) && val > 0) {
        const isMonth = unit.startsWith("month") || unit.startsWith("mes");
        fullAgeText = `${val} ${val === 1 ? (isMonth ? "Month" : "Year") : (isMonth ? "Months" : "Years")}`;
        compactAgeText = `${val} ${isMonth ? (val === 1 ? "Mo" : "Mos") : (val === 1 ? "Yr" : "Yrs")}`;
      }
    } else if (animal.age) {
      fullAgeText = String(animal.age).trim();
      compactAgeText = fullAgeText;
    }

    const isInBasket = Array.isArray(cartState?.animals) && cartState.animals.some(a => a.id === animal.id);

    card.innerHTML = `
      <div class="dog-thumb-wrapper">
        <img src="${imageUrl}" alt="${escapeHtml(name)}" class="dog-thumb" loading="lazy" onerror="this.onerror=null;this.src=FALLBACK_IMAGE">
        <div class="animal-badges-overlay">
          <span class="animal-info-badge badge-type-gender" title="${escapeHtml(genderLabel ? genderLabel + ' ' + typeLabel : typeLabel)}">
            <span class="badge-icon">${escapeHtml(typeIcon)}</span>
            <span class="badge-gender-text">${escapeHtml(genderLabel || typeLabel)}</span>${genderLabel ? `<span class="badge-species-extra"> ${escapeHtml(typeLabel)}</span>` : ''}
          </span>
          <span class="animal-info-badge badge-age" title="${escapeHtml(fullAgeText)}">
            <span class="badge-icon">🎂</span>
            <span class="badge-age-full">${escapeHtml(fullAgeText)}</span>
            <span class="badge-age-compact">${escapeHtml(compactAgeText)}</span>
          </span>
        </div>
      </div>
      <div class="dog-name-row">
        <div class="dog-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <span class="animal-info-badge badge-status ${isAdopted ? 'adopted' : ''}">
          <span class="badge-icon">${isAdopted ? '🏡' : '🌸'}</span>
          <span class="badge-status-text">${isAdopted ? 'Adopted' : 'Available'}</span>
        </span>
      </div>
      <p class="dog-desc">${escapeHtml(desc)}</p>
      <div class="dog-card-footer">
        ${isAdopted ? `
          <button type="button" class="card-cart-btn" disabled style="background:#EDE7F6; color:#7E57C2;">
            Already Adopted 🏡
          </button>
        ` : `
          <button
            type="button"
            class="card-cart-btn ${isInBasket ? 'btn-in-cart' : 'pink-btn'}"
            onclick="toggleAnimalBasket('${animal.id}')"
            aria-label="${isInBasket ? 'Remove ' + escapeHtml(name) + ' from basket' : 'Add ' + escapeHtml(name) + ' to adoption basket'}"
          >
            ${isInBasket ? 'In Adoption Basket ✓' : 'Add to Adoption Basket 🐾'}
          </button>
        `}
      </div>
    `;
    grid.appendChild(card);
  });
}

/**
 * Filter animals based on search query, species (Dogs/Cats), gender (Male/Female), and status
 */
function filterAnimals() {
  const query = (document.getElementById("searchInput")?.value || "").toLowerCase().trim();
  const species = document.getElementById("speciesFilter")?.value || "all";
  const gender = document.getElementById("genderFilter")?.value || "all";
  const status = document.getElementById("statusFilter")?.value || "available";

  const filtered = loadedAnimals.filter(a => {
    const name = (a.name || "").toLowerCase();
    const desc = (a.description || a.desc || "").toLowerCase();
    const matchesSearch = !query || name.includes(query) || desc.includes(query);

    // Status filter
    let matchesStatus = true;
    if (status !== "all") {
      const aStatus = (a.status || "available").toLowerCase();
      const isAdopted = (aStatus === "adopted" || aStatus === "gone" || aStatus === "adoptado");
      if (status === "available") {
        matchesStatus = !isAdopted;
      } else if (status === "adopted") {
        matchesStatus = isAdopted;
      }
    }

    // Species filter
    let matchesSpecies = true;
    if (species !== "all") {
      let aType = (a.animal_type || a.species || "").toLowerCase();
      if (aType === "perro" || aType === "perra") aType = "dog";
      if (aType === "gato" || aType === "gata") aType = "cat";

      if (!aType) {
        if (name.includes("cat") || desc.includes("cat") || desc.includes("gato") || desc.includes("gata") || desc.includes("michi")) {
          aType = "cat";
        } else {
          aType = "dog";
        }
      }
      matchesSpecies = (aType === species);
    }

    // Gender filter
    let matchesGender = true;
    if (gender !== "all") {
      let aGender = (a.gender || "").toLowerCase();
      if (aGender === "macho") aGender = "male";
      if (aGender === "hembra") aGender = "female";

      if (!aGender) {
        if (desc.includes("female") || desc.includes("hembra") || desc.includes("girl") || desc.includes("she")) {
          aGender = "female";
        } else {
          aGender = "male";
        }
      }
      matchesGender = (aGender === gender);
    }

    return matchesSearch && matchesStatus && matchesSpecies && matchesGender;
  });

  renderAnimals(filtered);
}

// ==============================================================================
// 2. PRODUCTS SECTION (Online Pet Shop with Resilient Ordering)
// ==============================================================================

/**
 * Loads products from Supabase public.products table
 */
async function fetchProductsFromSupabase() {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  try {
    let { data, error } = await client
      .from("products")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      const retry = await client
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const plain = await client.from("products").select("*");
      data = plain.data;
    }

    if (data && data.length > 0) {
      const sorted = data.sort((a, b) => {
        const hasA = a.display_order !== undefined && a.display_order !== null && !isNaN(a.display_order) && Number(a.display_order) > 0;
        const hasB = b.display_order !== undefined && b.display_order !== null && !isNaN(b.display_order) && Number(b.display_order) > 0;
        if (hasA && hasB) return Number(a.display_order) - Number(b.display_order);
        if (hasA) return -1;
        if (hasB) return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
      renderProducts(sorted);
    }
  } catch (err) {
    console.warn("Could not query public.products, keeping default products:", err);
  }
}

function formatStockNotice(stock) {
  if (stock === null || stock === undefined || isNaN(stock) || stock === "") return "";
  const num = Number(stock);
  if (num === 0) {
    return `<div class="product-stock-status stock-out">Out of stock</div>`;
  }
  if (num >= 1 && num <= 4) {
    const unitText = num === 1 ? "Only 1 left in stock!" : `Only ${num} left in stock!`;
    return `<div class="product-stock-status stock-low">${escapeHtml(unitText)}</div>`;
  }
  return ""; // 5 or more units: do not display low stock warning
}

function renderProducts(products) {
  loadedProducts = products || [];
  const grid = document.getElementById("productsGrid");
  if (!grid) return;
  grid.innerHTML = "";

  products.forEach(product => {
    const card = document.createElement("div");
    card.className = "product-card";
    const imgUrl = product.image_url || product.image || "images/pet-shop-supplies.png";
    const inCart = Array.isArray(cartState?.products) && cartState.products.find(p => p.id === product.id);

    const hasTrackedStock = (product.stock_quantity !== null && product.stock_quantity !== undefined && !isNaN(product.stock_quantity) && product.stock_quantity !== "");
    const stockNum = hasTrackedStock ? Number(product.stock_quantity) : null;
    const isOutOfStock = hasTrackedStock && stockNum === 0;
    const stockHtml = formatStockNotice(product.stock_quantity);

    card.innerHTML = `
      <img src="${imgUrl}" alt="${escapeHtml(product.name)}" class="product-img" loading="lazy" onerror="this.onerror=null;this.src=FALLBACK_IMAGE">
      <div class="product-title">${escapeHtml(product.name)}</div>
      <div class="product-price">${escapeHtml(product.price)}</div>
      ${stockHtml}
      <div style="margin-top: 12px;">
        <button
          type="button"
          class="card-cart-btn ${isOutOfStock ? 'btn-out-of-stock' : inCart ? 'btn-in-cart' : 'btn-primary'}"
          ${isOutOfStock ? 'disabled' : `onclick="addProductToCart('${product.id}')"`}
          aria-label="${isOutOfStock ? 'Out of stock' : `Add ${escapeHtml(product.name)} to shopping cart`}"
        >
          ${isOutOfStock ? 'Out of Stock' : inCart ? `In Cart (${inCart.qty}) 🛒 +` : 'Add to Cart 🛒'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ==============================================================================
// 3. INTERACTIVE ROTATING GALLERY (Auto-rotation, Synced Thumbnails)
// ==============================================================================

/**
 * Loads featured photos from Supabase public.gallery table
 */
async function fetchGalleryFromSupabase() {
  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  try {
    let { data, error } = await client
      .from("gallery")
      .select("*")
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      const retry = await client
        .from("gallery")
        .select("*")
        .order("created_at", { ascending: false });
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      const plain = await client.from("gallery").select("*");
      data = plain.data;
    }

    if (data && data.length > 0) {
      const sorted = data.sort((a, b) => {
        const hasA = a.display_order !== undefined && a.display_order !== null && !isNaN(a.display_order) && Number(a.display_order) > 0;
        const hasB = b.display_order !== undefined && b.display_order !== null && !isNaN(b.display_order) && Number(b.display_order) > 0;
        if (hasA && hasB) return Number(a.display_order) - Number(b.display_order);
        if (hasA) return -1;
        if (hasB) return 1;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
      renderGallery(sorted);
    }
  } catch (err) {
    console.warn("Could not query public.gallery, keeping default photos:", err);
  }
}

/**
 * Renders gallery items dynamically in configured display order with auto-rotation and thumbnail sync
 */
function renderGallery(items) {
  if (!items || items.length === 0) return;
  galleryItemsList = items;

  const thumbsGrid = document.getElementById("galleryThumbnailsGrid");

  // Display the first image in the admin-configured order on initial load
  currentGalleryIndex = 0;
  const selectedItem = items[0];
  const selectedUrl = selectedItem.image_url || selectedItem.image || "images/pet-adoption-showcase.png";
  const selectedTitle = selectedItem.title || selectedItem.caption || "PawHaven Pet Care";

  const mainImg = document.getElementById("liveGalleryImg");
  const caption = document.getElementById("liveGalleryCaption");
  if (mainImg) {
    mainImg.src = selectedUrl;
    mainImg.alt = selectedTitle;
  }
  if (caption) {
    caption.textContent = selectedTitle;
  }

  if (thumbsGrid) {
    thumbsGrid.innerHTML = "";
    items.forEach((item, idx) => {
      const url = item.image_url || item.image || "images/pet-adoption-showcase.png";
      const title = item.title || item.caption || "PawHaven Pet Care";
      const isSelected = (idx === currentGalleryIndex);

      const thumb = document.createElement("div");
      thumb.className = `thumb-item ${isSelected ? "active" : ""}`;
      thumb.setAttribute("role", "button");
      thumb.setAttribute("tabindex", "0");
      thumb.setAttribute("aria-label", `View ${title}`);

      thumb.onclick = function () {
        selectGalleryImageByIndex(idx, true);
      };
      thumb.onkeydown = function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectGalleryImageByIndex(idx, true);
        }
      };

      thumb.innerHTML = `<img src="${url}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.onerror=null;this.src=FALLBACK_IMAGE">`;
      thumbsGrid.appendChild(thumb);
    });

    // Do not call scrollIntoView here to prevent page from jumping to gallery on load
  }

  // Setup pause-on-hover & touch listeners
  const galleryWrapper = document.querySelector(".gallery-interactive-wrapper");
  if (galleryWrapper && !galleryWrapper.dataset.hoverAttached) {
    galleryWrapper.dataset.hoverAttached = "true";
    galleryWrapper.addEventListener("mouseenter", () => stopGalleryAutoPlay());
    galleryWrapper.addEventListener("mouseleave", () => startGalleryAutoPlay());
    galleryWrapper.addEventListener("touchstart", () => stopGalleryAutoPlay(), { passive: true });
    galleryWrapper.addEventListener("touchend", () => {
      setTimeout(startGalleryAutoPlay, 2500);
    }, { passive: true });
  }

  // Pause when browser tab is inactive to save battery
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopGalleryAutoPlay();
    } else {
      startGalleryAutoPlay();
    }
  });

  // Start automatic rotation every 4 seconds
  startGalleryAutoPlay();
}

function selectGalleryImageByIndex(idx, isManual = false) {
  if (!galleryItemsList || galleryItemsList.length === 0) return;
  currentGalleryIndex = (idx + galleryItemsList.length) % galleryItemsList.length;

  const item = galleryItemsList[currentGalleryIndex];
  const url = item.image_url || item.image || "images/pet-adoption-showcase.png";
  const title = item.title || item.caption || "PawHaven Pet Care";

  const allThumbs = Array.from(document.querySelectorAll(".gallery-thumbnails-grid .thumb-item"));
  const targetThumb = allThumbs[currentGalleryIndex];

  switchGalleryImg(url, title, targetThumb, isManual);

  // If user manually clicked, scroll ONLY the thumbnail grid container itself, NEVER the window!
  if (targetThumb && isManual) {
    const thumbsGrid = document.getElementById("galleryThumbnailsGrid");
    if (thumbsGrid && thumbsGrid.scrollHeight > thumbsGrid.clientHeight) {
      const cTop = thumbsGrid.scrollTop;
      const cHeight = thumbsGrid.clientHeight;
      const tTop = targetThumb.offsetTop - thumbsGrid.offsetTop;
      const tHeight = targetThumb.offsetHeight;
      if (tTop < cTop) {
        thumbsGrid.scrollTo({ top: tTop, behavior: "smooth" });
      } else if (tTop + tHeight > cTop + cHeight) {
        thumbsGrid.scrollTo({ top: tTop + tHeight - cHeight, behavior: "smooth" });
      }
    }
  }
}

function switchGalleryImg(imgSrc, captionText, thumbElement, isManual = false) {
  const mainImg = document.getElementById("liveGalleryImg");
  const caption = document.getElementById("liveGalleryCaption");

  if (mainImg && imgSrc) {
    if (mainImg.src !== imgSrc) {
      mainImg.style.opacity = "0.7";
      mainImg.src = imgSrc;
      setTimeout(() => {
        mainImg.style.opacity = "1";
      }, 120);
    }
    if (captionText) {
      mainImg.alt = captionText;
    }
  }

  if (caption && captionText) {
    caption.textContent = captionText;
  }

  const allThumbs = Array.from(document.querySelectorAll(".gallery-thumbnails-grid .thumb-item"));
  allThumbs.forEach(item => {
    item.classList.remove("active");
  });
  if (thumbElement) {
    thumbElement.classList.add("active");
    const idx = allThumbs.indexOf(thumbElement);
    if (idx !== -1) {
      currentGalleryIndex = idx;
    }
  }

  if (isManual) {
    startGalleryAutoPlay();
  }
}

function startGalleryAutoPlay() {
  stopGalleryAutoPlay();
  if (!galleryItemsList || galleryItemsList.length <= 1) return;

  const interval = (typeof window.GALLERY_INTERVAL === "number" && window.GALLERY_INTERVAL > 0)
    ? window.GALLERY_INTERVAL
    : GALLERY_INTERVAL;

  galleryAutoPlayTimer = setInterval(() => {
    if (document.hidden) return;
    const nextIdx = (currentGalleryIndex + 1) % galleryItemsList.length;
    selectGalleryImageByIndex(nextIdx, false);
  }, interval);
}

function stopGalleryAutoPlay() {
  if (galleryAutoPlayTimer) {
    clearInterval(galleryAutoPlayTimer);
    galleryAutoPlayTimer = null;
  }
}

window.switchGalleryImg = switchGalleryImg;

// ==============================================================================
// 4. ALBUMS & MEDIA SECTION (Multi-Photo & Video Albums with Lightbox)
// ==============================================================================

/**
 * Loads albums from Supabase public.albums and public.album_media if configured
 */
async function fetchAlbumsFromSupabase() {
  const container = document.getElementById("albumsContainer");
  if (!container) return;

  const client = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!client) return;

  try {
    const { data: albumsData, error: albumsError } = await client
      .from("albums")
      .select("*")
      .order("created_at", { ascending: false });

    if (!albumsError && albumsData && albumsData.length > 0) {
      const { data: mediaData } = await client
        .from("album_media")
        .select("*")
        .order("created_at", { ascending: false });

      const allMedia = mediaData || [];
      const populatedAlbums = albumsData.map(album => ({
        ...album,
        media: allMedia.filter(m => m.album_id === album.id)
      }));

      container.style.display = "flex";
      renderAlbums(populatedAlbums);
    }
  } catch (err) {
    // Graceful silent fallback if albums table does not exist
    console.warn("Albums not available, keeping rotating gallery:", err);
  }
}

function renderAlbums(albums) {
  const container = document.getElementById("albumsContainer");
  if (!container || !albums || albums.length === 0) return;
  loadedAlbums = albums;
  container.innerHTML = "";

  albums.forEach(album => {
    const card = document.createElement("div");
    card.className = "album-presentation-card";
    card.dataset.albumId = album.id;

    const mediaList = album.media || [];
    const totalMedia = mediaList.length;
    const photoCount = mediaList.filter(m => m.media_type !== "video").length;
    const videoCount = mediaList.filter(m => m.media_type === "video").length;

    let countBadgeText = `${totalMedia} Items`;
    if (photoCount > 0 && videoCount > 0) {
      countBadgeText = `📷 ${photoCount} • 🎬 ${videoCount}`;
    } else if (videoCount > 0) {
      countBadgeText = `🎬 ${videoCount} ${videoCount === 1 ? "Video" : "Videos"}`;
    } else if (photoCount > 0) {
      countBadgeText = `📷 ${photoCount} ${photoCount === 1 ? "Photo" : "Photos"}`;
    }

    const previewItems = mediaList.slice(0, 6);
    const remainingCount = totalMedia > 6 ? (totalMedia - 6) : 0;

    let gridHtml = "";
    if (previewItems.length === 0) {
      gridHtml = `
        <div style="grid-column: 1 / -1; padding: 24px; text-align: center; color: var(--text-muted); font-size: 14px;">
          This album currently has no media files.
        </div>
      `;
    } else {
      gridHtml = previewItems.map((item, idx) => {
        const isSixth = (idx === 5);
        const hasOverlay = isSixth && remainingCount > 0;
        const isVideo = item.media_type === "video";
        const mediaUrl = item.media_url || FALLBACK_IMAGE;
        const caption = item.caption || album.title || "Rescue Album";

        const overlayHtml = hasOverlay ? `
          <div class="thumb-more-overlay">
            <span class="thumb-more-count">+${remainingCount}</span>
            <span class="thumb-more-subtext">More Photos</span>
          </div>
        ` : "";

        const videoBadgeHtml = isVideo ? `
          <div class="video-preview-badge">
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
            <span>VIDEO</span>
          </div>
        ` : "";

        const mediaTag = isVideo
          ? `<video src="${mediaUrl}" preload="metadata" muted playsinline></video>`
          : `<img src="${mediaUrl}" alt="${escapeHtml(caption)}" loading="lazy" onerror="this.onerror=null;this.src=FALLBACK_IMAGE">`;

        return `
          <div
            class="album-preview-item ${isVideo ? 'is-video-item' : ''} ${hasOverlay ? 'has-more' : ''}"
            role="button"
            tabindex="0"
            aria-label="View media in ${escapeHtml(album.title)}"
            onclick="openAlbumLightbox('${album.id}', ${idx})"
            onkeydown="if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openAlbumLightbox('${album.id}', ${idx}); }"
          >
            ${mediaTag}
            ${videoBadgeHtml}
            ${overlayHtml}
          </div>
        `;
      }).join("");
    }

    card.innerHTML = `
      <div class="album-header">
        <div class="album-info-left">
          <h3 class="album-card-title">${escapeHtml(album.title)}</h3>
          ${album.description ? `<p class="album-card-desc">${escapeHtml(album.description)}</p>` : ""}
        </div>
        <div class="album-info-right">
          <span class="album-media-badge">${escapeHtml(countBadgeText)}</span>
          ${totalMedia > 0 ? `
            <button
              type="button"
              class="album-view-all-btn"
              onclick="openAlbumLightbox('${album.id}', 0)"
              aria-label="Open complete ${escapeHtml(album.title)} album"
            >
              View Album ↗
            </button>
          ` : ""}
        </div>
      </div>
      <div class="album-preview-grid">
        ${gridHtml}
      </div>
    `;

    container.appendChild(card);
  });
}

// ==============================================================================
// 5. LIGHTBOX / FULL-SCREEN MEDIA VIEWER (Images & Videos)
// ==============================================================================

function setupLightboxListeners() {
  const lightbox = document.getElementById("galleryLightbox");
  const closeBtn = document.getElementById("closeLightboxBtn");
  const prevBtn = document.getElementById("lightboxPrevBtn");
  const nextBtn = document.getElementById("lightboxNextBtn");

  closeBtn?.addEventListener("click", closeLightbox);
  prevBtn?.addEventListener("click", prevLightboxMedia);
  nextBtn?.addEventListener("click", nextLightboxMedia);

  lightbox?.addEventListener("click", (e) => {
    if (e.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (!lightbox?.classList.contains("active")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") prevLightboxMedia();
    if (e.key === "ArrowRight") nextLightboxMedia();
  });
}

function openAlbumLightbox(albumId, initialIndex = 0) {
  const album = loadedAlbums.find(a => String(a.id) === String(albumId)) || defaultAlbumsData[0];
  if (!album || !album.media || album.media.length === 0) return;

  currentLightboxAlbum = album;
  currentLightboxIndex = Math.max(0, Math.min(initialIndex, album.media.length - 1));

  const lightbox = document.getElementById("galleryLightbox");
  if (!lightbox) return;

  lightbox.classList.add("active");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  displayCurrentLightboxMedia();
  renderLightboxThumbsStrip();
}
window.openAlbumLightbox = openAlbumLightbox;

function closeLightbox() {
  const lightbox = document.getElementById("galleryLightbox");
  if (!lightbox) return;

  const videoEl = document.getElementById("lightboxVideo");
  if (videoEl) {
    videoEl.pause();
    videoEl.src = "";
    videoEl.style.display = "none";
  }

  lightbox.classList.remove("active");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function prevLightboxMedia() {
  if (!currentLightboxAlbum || !currentLightboxAlbum.media) return;
  const len = currentLightboxAlbum.media.length;
  currentLightboxIndex = (currentLightboxIndex - 1 + len) % len;
  displayCurrentLightboxMedia();
}

function nextLightboxMedia() {
  if (!currentLightboxAlbum || !currentLightboxAlbum.media) return;
  const len = currentLightboxAlbum.media.length;
  currentLightboxIndex = (currentLightboxIndex + 1) % len;
  displayCurrentLightboxMedia();
}

function displayCurrentLightboxMedia() {
  if (!currentLightboxAlbum || !currentLightboxAlbum.media) return;
  const item = currentLightboxAlbum.media[currentLightboxIndex];
  if (!item) return;

  const imgEl = document.getElementById("lightboxImg");
  const videoEl = document.getElementById("lightboxVideo");
  const captionEl = document.getElementById("lightboxCaption");
  const counterEl = document.getElementById("lightboxCounter");

  const total = currentLightboxAlbum.media.length;
  const isVideo = item.media_type === "video";
  const captionText = item.caption || currentLightboxAlbum.title || "";

  if (counterEl) {
    counterEl.textContent = `${currentLightboxIndex + 1} / ${total}`;
  }
  if (captionEl) {
    captionEl.textContent = captionText;
  }

  if (isVideo) {
    if (imgEl) imgEl.style.display = "none";
    if (videoEl) {
      videoEl.style.display = "block";
      videoEl.src = item.media_url;
      videoEl.muted = false;
      videoEl.controls = true;
      videoEl.play().catch(() => {
        videoEl.muted = true;
        videoEl.play().catch(() => {});
      });
    }
  } else {
    if (videoEl) {
      videoEl.pause();
      videoEl.src = "";
      videoEl.style.display = "none";
    }
    if (imgEl) {
      imgEl.style.display = "block";
      imgEl.src = item.media_url || FALLBACK_IMAGE;
      imgEl.alt = captionText;
    }
  }

  const stripItems = document.querySelectorAll(".lightbox-strip-item");
  stripItems.forEach((stripItem, idx) => {
    if (idx === currentLightboxIndex) {
      stripItem.classList.add("active");
      stripItem.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    } else {
      stripItem.classList.remove("active");
    }
  });
}

function renderLightboxThumbsStrip() {
  const strip = document.getElementById("lightboxThumbsStrip");
  if (!strip || !currentLightboxAlbum || !currentLightboxAlbum.media) return;
  strip.innerHTML = "";

  currentLightboxAlbum.media.forEach((item, idx) => {
    const thumb = document.createElement("div");
    thumb.className = `lightbox-strip-item ${idx === currentLightboxIndex ? "active" : ""}`;
    thumb.setAttribute("role", "button");
    thumb.setAttribute("tabindex", "0");
    thumb.setAttribute("aria-label", `Jump to item ${idx + 1}`);

    const isVideo = item.media_type === "video";
    const mediaUrl = item.media_url || FALLBACK_IMAGE;

    const mediaTag = isVideo
      ? `<video src="${mediaUrl}" preload="metadata" muted></video>`
      : `<img src="${mediaUrl}" alt="Thumb" loading="lazy">`;

    thumb.innerHTML = `
      ${mediaTag}
      ${isVideo ? `<span class="strip-video-indicator">▶</span>` : ""}
    `;

    thumb.onclick = () => {
      currentLightboxIndex = idx;
      displayCurrentLightboxMedia();
    };

    thumb.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        currentLightboxIndex = idx;
        displayCurrentLightboxMedia();
      }
    };

    strip.appendChild(thumb);
  });
}

// ==============================================================================
// 5. SHARED CART & ADOPTION BASKET SYSTEM (PRIORITIES 3 & 4)
// ==============================================================================

function parsePriceNumber(priceStr) {
  if (typeof priceStr === "number") return priceStr;
  if (!priceStr) return 0;
  const cleaned = String(priceStr).replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function loadCartState() {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY) || localStorage.getItem("proyectotnr_cart_v2");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        cartState.products = Array.isArray(parsed.products) ? parsed.products : [];
        cartState.animals = Array.isArray(parsed.animals) ? parsed.animals : [];
      }
    }
  } catch (e) {
    console.warn("Could not load cart state from localStorage:", e);
  }
}

function saveCartState() {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartState));
  } catch (e) {
    console.warn("Could not save cart state to localStorage:", e);
  }
  updateCartUI();
}

function getShopSubtotal() {
  return cartState.products.reduce((acc, item) => {
    // Validate price from loadedProducts if available to prevent client tampering
    const officialProd = loadedProducts.find(p => p.id === item.id);
    const unitPrice = officialProd ? parsePriceNumber(officialProd.price) : item.priceNum;
    return acc + (unitPrice * (item.qty || 1));
  }, 0);
}

/**
 * Displays a lightweight confirmation toast on the public site when adding items or handling errors.
 */
function showSiteToast(message, type = "success") {
  let toastContainer = document.getElementById("siteToastContainer");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.id = "siteToastContainer";
    toastContainer.className = "site-toast-container";
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement("div");
  toast.className = `site-toast ${type === "error" ? "site-toast-error" : "site-toast-success"}`;
  toast.setAttribute("role", "status");
  toast.innerHTML = `
    <span class="site-toast-icon">${type === "error" ? "⚠️" : "✨"}</span>
    <span class="site-toast-text">${escapeHtml(message)}</span>
    <button type="button" class="site-toast-action" onclick="openCartDrawer('shop')" aria-label="Open shopping cart">
      View Cart 🛒
    </button>
  `;

  toastContainer.appendChild(toast);
  setTimeout(() => toast.classList.add("visible"), 10);

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}
window.showSiteToast = showSiteToast;

/**
 * Synchronizes button labels and active states on cards without resetting user filters.
 */
function syncCardButtonsWithCart() {
  // Update Product Cards
  document.querySelectorAll("#productsGrid .product-card").forEach(card => {
    const btn = card.querySelector(".card-cart-btn");
    if (!btn || btn.disabled) return;
    const match = btn.getAttribute("onclick")?.match(/addProductToCart\('([^']+)'\)/);
    if (!match) return;
    const prodId = match[1];
    const inCart = Array.isArray(cartState?.products) && cartState.products.find(p => p.id === prodId);
    if (inCart) {
      btn.className = "card-cart-btn btn-in-cart";
      btn.textContent = `In Cart (${inCart.qty}) 🛒 +`;
    } else {
      btn.className = "card-cart-btn btn-primary";
      btn.textContent = "Add to Cart 🛒";
    }
  });

  // Update Animal Cards
  document.querySelectorAll("#dogsGrid .dog-card").forEach(card => {
    const btn = card.querySelector(".card-cart-btn");
    if (!btn || btn.disabled) return;
    const match = btn.getAttribute("onclick")?.match(/toggleAnimalBasket\('([^']+)'\)/);
    if (!match) return;
    const animalId = match[1];
    const inBasket = Array.isArray(cartState?.animals) && cartState.animals.some(a => a.id === animalId);
    if (inBasket) {
      btn.className = "card-cart-btn btn-in-cart";
      btn.textContent = "In Adoption Basket ✓";
    } else {
      btn.className = "card-cart-btn pink-btn";
      btn.textContent = "Add to Adoption Basket 🐾";
    }
  });
}
window.syncCardButtonsWithCart = syncCardButtonsWithCart;

function addProductToCart(productId) {
  const prod = loadedProducts.find(p => p.id === productId) || defaultProductsData.find(p => p.id === productId);
  if (!prod) return;

  const hasTrackedStock = (prod.stock_quantity !== null && prod.stock_quantity !== undefined && !isNaN(prod.stock_quantity) && prod.stock_quantity !== "");
  const stockLimit = hasTrackedStock ? Number(prod.stock_quantity) : Infinity;

  if (stockLimit <= 0) {
    showSiteToast("Sorry, this item is currently out of stock.", "error");
    return;
  }

  const existing = cartState.products.find(p => p.id === productId);
  if (existing) {
    if (existing.qty >= stockLimit) {
      showSiteToast(`Only ${stockLimit} unit${stockLimit === 1 ? '' : 's'} available in stock.`, "error");
      return;
    }
    existing.qty = (existing.qty || 1) + 1;
  } else {
    cartState.products.push({
      id: prod.id,
      name: prod.name,
      price: prod.price,
      priceNum: parsePriceNumber(prod.price),
      image_url: prod.image_url || prod.image || "images/pet-shop-supplies.png",
      qty: 1
    });
  }

  saveCartState();
  // Cart stays closed; notification toast confirms addition while customer continues browsing
  showSiteToast(`"${prod.name}" added to cart! 🛍️`);
}

function updateProductQty(productId, delta) {
  const item = cartState.products.find(p => p.id === productId);
  if (!item) return;

  const prod = loadedProducts.find(p => p.id === productId) || defaultProductsData.find(p => p.id === productId);
  const hasTrackedStock = (prod && prod.stock_quantity !== null && prod.stock_quantity !== undefined && !isNaN(prod.stock_quantity) && prod.stock_quantity !== "");
  const stockLimit = hasTrackedStock ? Number(prod.stock_quantity) : Infinity;

  if (delta > 0) {
    if (item.qty >= stockLimit) {
      showSiteToast(`Only ${stockLimit} unit${stockLimit === 1 ? '' : 's'} available in stock.`, "error");
      return;
    }
    if ((item.qty + delta) > stockLimit) {
      showSiteToast(`Only ${stockLimit} unit${stockLimit === 1 ? '' : 's'} available in stock.`, "error");
      item.qty = stockLimit;
      saveCartState();
      return;
    }
  }

  item.qty = (item.qty || 1) + delta;
  if (item.qty <= 0) {
    cartState.products = cartState.products.filter(p => p.id !== productId);
  } else if (item.qty > stockLimit) {
    item.qty = stockLimit;
  }

  saveCartState();
}

function removeProductFromCart(productId) {
  cartState.products = cartState.products.filter(p => p.id !== productId);
  saveCartState();
}

function toggleAnimalBasket(animalId) {
  const animal = loadedAnimals.find(a => a.id === animalId);
  if (!animal) return;

  const status = (animal.status || "available").toLowerCase();
  if (status === "adopted" || status === "gone") {
    showSiteToast("This animal has already found a forever home! 🏡", "error");
    return;
  }

  const existingIdx = cartState.animals.findIndex(a => a.id === animalId);
  if (existingIdx !== -1) {
    cartState.animals.splice(existingIdx, 1);
    saveCartState();
    showSiteToast(`"${animal.name}" removed from adoption basket.`);
  } else {
    const badges = formatTypeGenderBadge(animal);
    cartState.animals.push({
      id: animal.id,
      name: animal.name,
      animal_type: badges,
      image_url: animal.image_url || FALLBACK_IMAGE
    });
    saveCartState();
    // Basket stays closed; subtle confirmation toast is shown
    showSiteToast(`"${animal.name}" added to adoption basket! 🐾`);
  }
}

function removeAnimalFromBasket(animalId) {
  cartState.animals = cartState.animals.filter(a => a.id !== animalId);
  saveCartState();
}

function updateCartUI() {
  const shopCount = cartState.products.reduce((acc, p) => acc + (p.qty || 1), 0);
  const adoptionCount = cartState.animals.length;
  const totalCount = shopCount + adoptionCount;

  // 1. Update Badge Counters
  const headerCountEl = document.getElementById("headerCartCount");
  if (headerCountEl) headerCountEl.textContent = totalCount;

  const floatingCountEl = document.getElementById("floatingCartCount");
  if (floatingCountEl) floatingCountEl.textContent = totalCount;

  const floatingBtn = document.getElementById("floatingCartBtn");
  if (floatingBtn) {
    floatingBtn.style.display = totalCount > 0 ? "flex" : "none";
  }

  const shopTabCountEl = document.getElementById("cartShopCount");
  if (shopTabCountEl) shopTabCountEl.textContent = shopCount;

  const adoptionTabCountEl = document.getElementById("cartAdoptionCount");
  if (adoptionTabCountEl) adoptionTabCountEl.textContent = adoptionCount;

  // 2. Render Shop Items in Drawer
  const shopListEl = document.getElementById("cartShopItemsList");
  const shopEmptyEl = document.getElementById("cartShopEmpty");
  const shopFooterEl = document.getElementById("shopFooterSummary");
  const subtotalEl = document.getElementById("cartSubtotalAmount");

  if (shopListEl && shopEmptyEl && shopFooterEl) {
    if (cartState.products.length === 0) {
      shopListEl.innerHTML = "";
      shopEmptyEl.style.display = "flex";
      shopFooterEl.style.display = "none";
    } else {
      shopEmptyEl.style.display = "none";
      shopFooterEl.style.display = "flex";

      const subtotal = getShopSubtotal();
      if (subtotalEl) subtotalEl.textContent = `$${subtotal.toFixed(2)}`;

      shopListEl.innerHTML = cartState.products.map(item => {
        const official = loadedProducts.find(p => p.id === item.id);
        const unit = official ? parsePriceNumber(official.price) : item.priceNum;
        const lineTotal = (unit * (item.qty || 1)).toFixed(2);

        return `
          <div class="cart-item-row" data-id="${item.id}">
            <img src="${item.image_url}" alt="${escapeHtml(item.name)}" class="cart-item-thumb" onerror="this.onerror=null;this.src=FALLBACK_IMAGE">
            <div class="cart-item-info">
              <span class="cart-item-name">${escapeHtml(item.name)}</span>
              <span class="cart-item-unit-price">${escapeHtml(item.price)} each</span>
              <div class="cart-qty-controls">
                <button type="button" class="btn-qty-adj" onclick="updateProductQty('${item.id}', -1)" aria-label="Decrease quantity">-</button>
                <span class="cart-qty-val">${item.qty || 1}</span>
                <button type="button" class="btn-qty-adj" onclick="updateProductQty('${item.id}', 1)" aria-label="Increase quantity">+</button>
              </div>
            </div>
            <div class="cart-item-right">
              <span class="cart-item-subtotal">$${lineTotal}</span>
              <button type="button" class="cart-item-remove-btn" onclick="removeProductFromCart('${item.id}')" title="Remove item" aria-label="Remove ${escapeHtml(item.name)}">
                🗑
              </button>
            </div>
          </div>
        `;
      }).join("");
    }
  }

  // 3. Render Adoption Animals in Drawer
  const adpListEl = document.getElementById("cartAdoptionItemsList");
  const adpEmptyEl = document.getElementById("cartAdoptionEmpty");
  const adpFooterEl = document.getElementById("adoptionFooterSummary");

  if (adpListEl && adpEmptyEl && adpFooterEl) {
    if (cartState.animals.length === 0) {
      adpListEl.innerHTML = "";
      adpEmptyEl.style.display = "flex";
      adpFooterEl.style.display = "none";
    } else {
      adpEmptyEl.style.display = "none";
      adpFooterEl.style.display = "flex";

      adpListEl.innerHTML = cartState.animals.map(animal => `
        <div class="adoption-animal-row" data-id="${animal.id}">
          <img src="${animal.image_url}" alt="${escapeHtml(animal.name)}" class="adoption-animal-thumb" onerror="this.onerror=null;this.src=FALLBACK_IMAGE">
          <div class="adoption-animal-info">
            <span class="adoption-animal-name">${escapeHtml(animal.name)}</span>
            <span class="adoption-animal-meta">${escapeHtml(animal.animal_type || "Rescue Companion")}</span>
          </div>
          <button type="button" class="cart-item-remove-btn" onclick="removeAnimalFromBasket('${animal.id}')" title="Remove from basket" aria-label="Remove ${escapeHtml(animal.name)} from adoption basket">
            🗑
          </button>
        </div>
      `).join("");
    }
  }

  // 4. Synchronize buttons on public catalog cards without destroying filter state
  syncCardButtonsWithCart();
}

function openCartDrawer(tab = "shop") {
  const overlay = document.getElementById("cartDrawerOverlay");
  if (!overlay) return;

  // Show basket view, hide checkout & confirmation
  const basketView = document.getElementById("cartBasketView");
  const checkoutView = document.getElementById("cartCheckoutView");
  const confirmView = document.getElementById("cartConfirmationView");
  const footerView = document.getElementById("cartDrawerFooter");

  if (basketView) basketView.style.display = "flex";
  if (checkoutView) checkoutView.classList.remove("active");
  if (confirmView) confirmView.classList.remove("active");
  if (footerView) footerView.style.display = "flex";

  // Switch to requested tab
  switchCartTab(tab === "adoption" ? "adoptionTab" : "shopTab");

  overlay.classList.add("active");
  overlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("menu-locked");
}

function closeCartDrawer() {
  const overlay = document.getElementById("cartDrawerOverlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("menu-locked");
}

function switchCartTab(targetTabId) {
  const tabsNav = document.getElementById("drawerTabsNav");
  if (!tabsNav) return;

  tabsNav.querySelectorAll(".cart-drawer-tab").forEach(tab => {
    const isTarget = tab.dataset.tab === targetTabId;
    tab.classList.toggle("active", isTarget);
    tab.setAttribute("aria-selected", isTarget ? "true" : "false");
  });

  const shopPane = document.getElementById("shopTab");
  const adpPane = document.getElementById("adoptionTab");
  const shopFooter = document.getElementById("shopFooterSummary");
  const adpFooter = document.getElementById("adoptionFooterSummary");

  if (targetTabId === "shopTab") {
    if (shopPane) shopPane.classList.add("active");
    if (adpPane) adpPane.classList.remove("active");
    if (shopFooter) shopFooter.style.display = cartState.products.length > 0 ? "flex" : "none";
    if (adpFooter) adpFooter.style.display = "none";
  } else {
    if (shopPane) shopPane.classList.remove("active");
    if (adpPane) adpPane.classList.add("active");
    if (shopFooter) shopFooter.style.display = "none";
    if (adpFooter) adpFooter.style.display = cartState.animals.length > 0 ? "flex" : "none";
  }
}


function proceedToCheckout(type) {
  const basketView = document.getElementById("cartBasketView");
  const checkoutView = document.getElementById("cartCheckoutView");
  const footerView = document.getElementById("cartDrawerFooter");
  const reviewTitle = document.getElementById("checkoutReviewTitle");
  const reviewItems = document.getElementById("checkoutReviewItems");
  const reviewTotalRow = document.getElementById("checkoutReviewTotalRow");
  const reqTypeInput = document.getElementById("checkoutRequestType");
  const submitBtn = document.getElementById("submitRequestBtn");
  const addressLabel = document.getElementById("custAddressLabel");

  if (!checkoutView || !reviewItems) return;

  const hasProducts = cartState.products.length > 0;
  const hasAnimals = cartState.animals.length > 0;

  if (!hasProducts && !hasAnimals) {
    alert("Please add animals or products to your basket first.");
    return;
  }

  // Check product stock before checkout
  let adjusted = false;

  for (let i = cartState.products.length - 1; i >= 0; i--) {
    const item = cartState.products[i];
    const prod = loadedProducts.find(p => p.id === item.id)
      || defaultProductsData.find(p => p.id === item.id);

    if (prod && prod.stock_quantity !== null &&
        prod.stock_quantity !== undefined &&
        prod.stock_quantity !== "" &&
        !isNaN(prod.stock_quantity)) {
      const stockLimit = Number(prod.stock_quantity);

      if (stockLimit <= 0) {
        alert(`"${item.name}" is out of stock and has been removed.`);
        cartState.products.splice(i, 1);
        adjusted = true;
      } else if (item.qty > stockLimit) {
        alert(`Only ${stockLimit} unit(s) of "${item.name}" are available.`);
        item.qty = stockLimit;
        adjusted = true;
      }
    }
  }

  if (adjusted) saveCartState();

  const stillHasProducts = cartState.products.length > 0;
  const stillHasAnimals = cartState.animals.length > 0;

  if (!stillHasProducts && !stillHasAnimals) {
    alert("Your basket is empty.");
    return;
  }

  // Keep the existing submit handler compatible for now.
  // The combined submission logic must be updated separately.
  reqTypeInput.value =
    stillHasProducts && stillHasAnimals ? "combined" :
    stillHasAnimals ? "adoption" : "shop";

  if (addressLabel) {
    addressLabel.textContent =
      stillHasAnimals && stillHasProducts
        ? "Home / Delivery Address *"
        : stillHasAnimals
          ? "Home / Residential Address *"
          : "Delivery Address *";
  }

  if (submitBtn) {
    submitBtn.textContent =
      stillHasAnimals && stillHasProducts
        ? "Submit Combined Request 🐾🛍️"
        : stillHasAnimals
          ? "Submit Adoption Application 🐾"
          : "Confirm Order Submission 🛒";
  }

  if (reviewTitle) {
    reviewTitle.textContent =
      stillHasAnimals && stillHasProducts
        ? "Adoption & Shop Review 🐾🛍️"
        : stillHasAnimals
          ? "Adoption Application Review 🐾"
          : "Order Review: Pet Shop Items 🛍️";
  }

  let reviewHTML = "";

  if (stillHasAnimals) {
    reviewHTML += `
      <div class="checkout-review-item-row">
        <strong>🐾 Animals for Adoption</strong>
        <span>Free</span>
      </div>
    `;

    reviewHTML += cartState.animals.map(a => `
      <div class="checkout-review-item-row">
        <span>🐾 ${escapeHtml(a.name)} (${escapeHtml(a.animal_type || "Rescue")})</span>
        <span style="color:#2E7D32;font-weight:800;">Adoption Request</span>
      </div>
    `).join("");
  }

  if (stillHasProducts) {
    reviewHTML += `
      <div class="checkout-review-item-row">
        <strong>🛍️ Pet Shop Products</strong>
        <span></span>
      </div>
    `;

    reviewHTML += cartState.products.map(item => {
      const official = loadedProducts.find(p => p.id === item.id);
      const unit = official ? parsePriceNumber(official.price) : item.priceNum;
      const qty = item.qty || 1;

      return `
        <div class="checkout-review-item-row">
          <span>${qty}x ${escapeHtml(item.name)}</span>
          <span>$${(unit * qty).toFixed(2)}</span>
        </div>
      `;
    }).join("");
  }

  reviewItems.innerHTML = reviewHTML;

  const subtotal = getShopSubtotal();

  if (reviewTotalRow) {
    reviewTotalRow.style.display = "flex";
    reviewTotalRow.innerHTML = `
      <span>${stillHasAnimals && stillHasProducts ? "Products Total:" : stillHasProducts ? "Total Order Amount:" : "Adoption Fee:"}</span>
      <span style="color:${stillHasProducts ? "inherit" : "#2E7D32"};">
        ${stillHasProducts ? `$${subtotal.toFixed(2)}` : "Free / Voluntary Donation"}
      </span>
    `;
  }

  if (basketView) basketView.style.display = "none";
  if (footerView) footerView.style.display = "none";
  checkoutView.classList.add("active");
}


function backToBasket() {
  const basketView = document.getElementById("cartBasketView");
  const checkoutView = document.getElementById("cartCheckoutView");
  const footerView = document.getElementById("cartDrawerFooter");

  if (checkoutView) checkoutView.classList.remove("active");
  if (basketView) basketView.style.display = "flex";
  if (footerView) footerView.style.display = "flex";

  const reqType = document.getElementById("checkoutRequestType")?.value || "shop";
  switchCartTab(reqType === "adoption" ? "adoptionTab" : "shopTab");
}

let currentOrderDetailsMessage = "";

function copyOrderDetailsToClipboard(customFeedbackMsg) {
  if (!currentOrderDetailsMessage) return;
  const notif = document.getElementById("copyNotificationMsg");
  const showFeedback = (text) => {
    if (notif) {
      notif.textContent = text || "✅ Order details copied to clipboard! Paste directly into your chat.";
      notif.style.display = "block";
      setTimeout(() => {
        if (notif) notif.style.display = "none";
      }, 5500);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentOrderDetailsMessage)
      .then(() => showFeedback(customFeedbackMsg))
      .catch(() => fallbackClipboardCopy(currentOrderDetailsMessage, customFeedbackMsg, showFeedback));
  } else {
    fallbackClipboardCopy(currentOrderDetailsMessage, customFeedbackMsg, showFeedback);
  }
}

function fallbackClipboardCopy(text, feedbackMsg, callback) {
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok && typeof callback === "function") {
      callback(feedbackMsg);
    }
  } catch (e) {
    console.warn("Fallback clipboard copy notice:", e);
  }
}


async function handleRequestSubmission(e) {
  e.preventDefault();

  const name = (document.getElementById("custName")?.value || "").trim();
  const phone = (document.getElementById("custPhone")?.value || "").trim();
  const address = (document.getElementById("custAddress")?.value || "").trim();
  const city = (document.getElementById("custCity")?.value || "").trim();
  const notes = (document.getElementById("custNotes")?.value || "").trim();
  const submitBtn = document.getElementById("submitRequestBtn");

  const hasProducts = cartState.products.length > 0;
  const hasAnimals = cartState.animals.length > 0;

  if (!hasProducts && !hasAnimals) {
    alert("Your basket is empty. Add animals or products first.");
    return;
  }

  if (!name || !phone || !address || !city) {
    alert("Please complete your name, phone, address, and city.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Saving your request...";

  const client = window.getSupabaseClient
    ? window.getSupabaseClient()
    : null;

  const now = new Date();
  const dateTag = now.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);

  // One reference number connects both records.
  const refNo = `REQ-${dateTag}-${suffix}`;

  try {
    // Recheck current product stock.
    if (hasProducts && client) {
      const ids = cartState.products.map(p => p.id).filter(Boolean);

      if (ids.length) {
        const { data: freshProducts, error: stockError } = await client
          .from("products")
          .select("id, name, stock_quantity")
          .in("id", ids);

        if (stockError) throw stockError;

        for (const item of cartState.products) {
          const product = (freshProducts || []).find(p => p.id === item.id);

          if (
            product &&
            product.stock_quantity !== null &&
            product.stock_quantity !== undefined &&
            product.stock_quantity !== ""
          ) {
            const stock = Number(product.stock_quantity);

            if (stock <= 0 || item.qty > stock) {
              alert(
                stock <= 0
                  ? `"${product.name || item.name}" is out of stock.`
                  : `Only ${stock} unit(s) of "${product.name || item.name}" remain.`
              );

              if (stock <= 0) {
                cartState.products = cartState.products.filter(p => p.id !== item.id);
              } else {
                item.qty = stock;
              }

              saveCartState();
              await fetchProductsFromSupabase();

              const nextType =
                cartState.products.length && cartState.animals.length
                  ? "combined"
                  : cartState.animals.length
                    ? "adoption"
                    : "shop";

              proceedToCheckout(nextType);
              return;
            }
          }
        }
      }
    }

    // Prepare the store order, if there are products.
    let subtotal = 0;
    let itemsPayload = [];

    if (hasProducts) {
      // Live stock verification before submitting order
      for (const item of cartState.products) {
        const product = loadedProducts.find(p => p.id === item.id);
        if (product && product.stock_quantity !== null && product.stock_quantity !== undefined && !isNaN(product.stock_quantity) && product.stock_quantity !== "") {
          const available = Number(product.stock_quantity);
          const requested = item.qty || 1;
          if (available < requested) {
            throw new Error(`Insufficient stock for "${product.name}". Only ${available} unit(s) remaining in stock.`);
          }
        }
      }

      itemsPayload = cartState.products.map(item => {
        const product =
          loadedProducts.find(p => p.id === item.id) ||
          defaultProductsData.find(p => p.id === item.id);

        const unit = product
          ? parsePriceNumber(product.price)
          : item.priceNum;

        const quantity = item.qty || 1;
        const lineTotal = unit * quantity;

        subtotal += lineTotal;

        return {
          product_id: item.id,
          product_name: item.name,
          unit_price: `$${unit.toFixed(2)}`,
          quantity,
          subtotal: `$${lineTotal.toFixed(2)}`
        };
      });
    }

    // Prepare the adoption request, if there are animals.
    const animalsPayload = cartState.animals.map(animal => ({
      animal_id: animal.id,
      animal_name: animal.name,
      animal_type: animal.animal_type || "Animal",
      image_url: animal.image_url || ""
    }));

    // Save the order first, if needed.
    if (hasProducts && client) {
      const { error } = await client.from("orders").insert([{
        reference_no: refNo,
        customer_name: name,
        customer_phone: phone,
        customer_email: "",
        delivery_address: address,
        city,
        notes,
        total_amount: subtotal,
        items: itemsPayload,
        status: "pending"
      }]);

      if (error) {
        console.error("Order registration failed:", error);
        throw new Error("Could not save your store order: " + error.message);
      }
    }

    // Save the adoption request, if needed.
    if (hasAnimals && client) {
      const { error } = await client.from("adoption_requests").insert([{
        reference_no: refNo,
        applicant_name: name,
        applicant_phone: phone,
        applicant_email: "",
        address,
        city,
        notes,
        animals: animalsPayload,
        status: "pending"
      }]);

      if (error) {
        console.error("Adoption registration failed:", error);
        throw new Error(
          "Could not save your adoption request: " + error.message +
          ". If you selected products too, contact the site owner before retrying."
        );
      }
    }

    // Build one message for the customer and site owner.
    const formattedDate = now.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });

    const formattedTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    });

    let whatsAppMsg =
      `🐾 *PAWHAVEN — REQUEST*\n` +
      `*Reference:* ${refNo}\n` +
      `*Date:* ${formattedDate} (${formattedTime})\n\n` +
      `👤 *Customer:* ${name}\n` +
      `📱 *Phone:* ${phone}\n` +
      `📍 *Address:* ${address}, ${city}\n` +
      (notes ? `📝 *Notes:* ${notes}\n` : "");

    if (hasAnimals) {
      whatsAppMsg += "\n🐾 *ADOPTION REQUEST*\n" +
        animalsPayload.map(a =>
          `• ${a.animal_name} (${a.animal_type})`
        ).join("\n") + "\n";
    }

    if (hasProducts) {
      whatsAppMsg += "\n🛍️ *STORE ORDER*\n" +
        itemsPayload.map(i =>
          `• ${i.quantity}x ${i.product_name} (${i.unit_price}) = ${i.subtotal}`
        ).join("\n") +
        `\n\n💰 *TOTAL: $${subtotal.toFixed(2)}*\n`;
    }

    whatsAppMsg += "\n_PawHaven Pet Platform — Please review this request._";

    // Clear both baskets only after the required inserts succeed.
    if (hasProducts) cartState.products = [];
    if (hasAnimals) cartState.animals = [];

    saveCartState();
    updateCartUI();

    if (hasProducts) {
      await fetchProductsFromSupabase();
    }

    showConfirmationScreen({
      title: hasProducts && hasAnimals
        ? "Your Adoption & Shop Request Is Almost Complete!"
        : hasAnimals
          ? "Your Adoption Application Is Almost Complete!"
          : "Your Order Is Almost Complete!",
      msg:
        "Your request has been saved to our records. " +
        "<strong>Please choose a contact option below to send your details.</strong>",
      refNo,
      whatsAppMsg
    });

  } catch (err) {
    console.error("Request submission error:", err);
    alert(err.message || "Something went wrong. Please try again.");

  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Confirm & Submit 🚀";
  }
}


function showConfirmationScreen({ title, msg, refNo, whatsAppMsg }) {
  const checkoutView = document.getElementById("cartCheckoutView");
  const confirmView = document.getElementById("cartConfirmationView");
  const confirmTitle = document.getElementById("confirmationTitle");
  const confirmMsg = document.getElementById("confirmationMsg");
  const confirmCode = document.getElementById("confirmationRefCode");
  const whatsAppBtn = document.getElementById("confirmationWhatsAppBtn");

  currentOrderDetailsMessage = whatsAppMsg || "";

  if (checkoutView) checkoutView.classList.remove("active");
  if (confirmTitle) confirmTitle.textContent = title;
  if (confirmMsg) confirmMsg.innerHTML = msg;
  if (confirmCode) confirmCode.textContent = refNo;

  if (whatsAppBtn) {
    const encoded = encodeURIComponent(whatsAppMsg);
    whatsAppBtn.href = `https://wa.me/9710000000000?text=${encoded}`;
  }

  const copyNotif = document.getElementById("copyNotificationMsg");
  if (copyNotif) copyNotif.style.display = "none";

  if (confirmView) confirmView.classList.add("active");
}

function initCartAndRequestBasket() {
  loadCartState();

  // Header & Floating Buttons
  document.getElementById("openCartBtn")?.addEventListener("click", () => openCartDrawer("shop"));
  document.getElementById("floatingCartBtn")?.addEventListener("click", () => openCartDrawer("shop"));
  document.getElementById("closeCartBtn")?.addEventListener("click", closeCartDrawer);

  // Close on backdrop click
  document.getElementById("cartDrawerOverlay")?.addEventListener("click", (e) => {
    if (e.target.id === "cartDrawerOverlay") closeCartDrawer();
  });

  // Drawer Tabs
  document.getElementById("tabBtnShop")?.addEventListener("click", () => switchCartTab("shopTab"));
  document.getElementById("tabBtnAdoption")?.addEventListener("click", () => switchCartTab("adoptionTab"));

  // Checkout Proceed Buttons
  document.getElementById("proceedShopCheckoutBtn")?.addEventListener("click", () => proceedToCheckout("shop"));
  document.getElementById("proceedAdoptionCheckoutBtn")?.addEventListener("click", () => proceedToCheckout("adoption"));

  // Checkout Back Button
  document.getElementById("backToBasketBtn")?.addEventListener("click", backToBasket);

  // Form Submission
  document.getElementById("requestSubmissionForm")?.addEventListener("submit", handleRequestSubmission);

  // Close Confirmation Button
  document.getElementById("closeConfirmationBtn")?.addEventListener("click", closeCartDrawer);

  // Social messaging & copy handlers
  document.getElementById("copyOrderDetailsBtn")?.addEventListener("click", () => {
    copyOrderDetailsToClipboard("✅ Order details copied to clipboard! Paste directly into your chat.");
  });

  document.getElementById("confirmationFbBtn")?.addEventListener("click", () => {
    copyOrderDetailsToClipboard("✅ Order details copied to clipboard! Paste them directly into Facebook Messenger.");
  });

  document.getElementById("confirmationIgBtn")?.addEventListener("click", () => {
    copyOrderDetailsToClipboard("✅ Order details copied to clipboard! Paste them directly into Instagram Direct Message.");
  });

  // Initial UI Render
  updateCartUI();
}

// Global exposes for inline handlers
window.addProductToCart = addProductToCart;
window.updateProductQty = updateProductQty;
window.removeProductFromCart = removeProductFromCart;
window.toggleAnimalBasket = toggleAnimalBasket;
window.removeAnimalFromBasket = removeAnimalFromBasket;
window.openCartDrawer = openCartDrawer;
window.closeCartDrawer = closeCartDrawer;

// ==============================================================================
// UTILITIES
// ==============================================================================
function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

// ==============================================================================
// MOBILE NAVIGATION SUPPORT
// ==============================================================================
function initMobileNavigation() {
  const toggleBtn = document.getElementById("mobileMenuToggle");
  const mainNav = document.getElementById("mainNav");
  const navOverlay = document.getElementById("navOverlay");
  if (!toggleBtn || !mainNav) return;

  function openMenu() {
    mainNav.classList.add("nav-open");
    toggleBtn.classList.add("menu-open");
    toggleBtn.setAttribute("aria-expanded", "true");
    if (navOverlay) {
      navOverlay.classList.add("active");
      navOverlay.setAttribute("aria-hidden", "false");
    }
    document.body.classList.add("menu-locked");
  }

  function closeMenu() {
    mainNav.classList.remove("nav-open");
    toggleBtn.classList.remove("menu-open");
    toggleBtn.setAttribute("aria-expanded", "false");
    if (navOverlay) {
      navOverlay.classList.remove("active");
      navOverlay.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("menu-locked");
  }

  toggleBtn.addEventListener("click", () => {
    const isOpen = mainNav.classList.contains("nav-open");
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  });

  if (navOverlay) {
    navOverlay.addEventListener("click", closeMenu);
  }

  // Close menu after a navigation link is clicked
  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu();
    });
  });

  // Close with Escape key
  document.addEventListener("keydown", (e) => {
    if ((e?.key === "Escape" || e?.keyCode === 27) && mainNav.classList.contains("nav-open")) {
      closeMenu();
      toggleBtn.focus();
    }
  });

  // Close on resize to desktop width
  window.addEventListener("resize", () => {
    if (window.innerWidth > 992 && mainNav.classList.contains("nav-open")) {
      closeMenu();
    }
  });
}