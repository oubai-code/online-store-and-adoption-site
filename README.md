# PawHaven — E-Commerce & Pet Adoption Web Platform

PawHaven is a full-featured, responsive web platform designed to facilitate pet adoptions and provide an online storefront for pet essentials. The application combines an animal rescue directory, an interactive photo and video gallery, a full e-commerce shopping experience, and an administrative management portal with live Supabase database synchronization.

---

## 🌟 Key Features

### 🐾 Live Pet Adoption Catalog
- **Interactive Multi-Criteria Filtering**: Filter rescue animals in real time by species (dogs, cats), gender (male, female), adoption status (available, adopted), and full-text keyword search across names and personality descriptions.
- **Detailed Pet Profiles**: Comprehensive animal information cards displaying age, gender, medical/sterilization status, personality traits, and rescue histories.
- **Adoption Request Basket**: Allows prospective adopters to select one or multiple animals to apply for adoption together through a streamlined, multi-step application flow.

### 🛍️ Online Pet Supplies Store
- **Product Catalog & Inventory Management**: Showcase pet accessories, leashes, harnesses, collars, and toys with dynamic inventory tracking.
- **Unified Multi-Tab Request Drawer**: Distinct tabs for online store merchandise and pet adoption applications within a slide-out drawer.
- **Stock Tracking & Real-Time Validation**: Automatic low-stock warnings (1–4 units remaining), out-of-stock badges, and quantity validation upon checkout submission.
- **Multi-Channel Dispatch & Order Confirmation**: Generates a unified request reference code (`REQ-YYYYMMDD-XXXX`) with one-click auto-filled dispatch via WhatsApp, social channels, or direct clipboard copy.

### ✨ Interactive Rotating Gallery & Media Viewer
- **Synchronized Hero Gallery**: Dynamic photo carousel featuring rescue animals and community activities with smooth transitions, synced thumbnail indicators, 4-second auto-rotation, and pause-on-hover behavior.
- **Full Media Lightbox**: Accessible modal dialog supporting high-resolution image viewing and HTML5 video playback with keyboard navigation (`Esc`, `←`, `→`).

### 🔐 Administrative Management Dashboard
- **Role-Based Access Control**: Secure administrator gatekeeper backed by Supabase Auth and database-level `is_admin()` security definer function in PostgreSQL.
- **Listing Management**: Add, update, reorder, or remove adoptable animal profiles with instant live site reflection.
- **Product & Inventory CMS**: Manage pet shop items, prices (USD), and inventory stock levels.
- **Order & Adoption Application Tracking**: Dedicated panels to inspect incoming customer orders, update order fulfillment status (`Pending`, `Confirmed`, `Delivered`, `Cancelled`), and review adoption applications (`Under Review`, `Approved`, `Rejected`).
- **Client-Side Image Optimization**: High-resolution photos are resized to web-ready dimensions (max 1920px) and converted to WebP client-side before uploading to Supabase Storage, saving bandwidth and storage.

---

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Semantic HTML5, Modern CSS3 (Custom Properties, CSS Grid, Flexbox, Fluid Typography), Vanilla JavaScript (ES6+) |
| **Backend / BaaS** | Supabase (PostgreSQL 15+, PostgREST, Supabase Auth, Supabase Storage) |
| **Security & RLS** | PostgreSQL Row-Level Security (RLS) policies, Security Definer administrative functions, atomic database procedures |
| **Tooling & Assets** | Scalable Vector Graphics (SVG), WebP image compression, Client-side Canvas API |

---

## 📁 Project Structure

```
├── index.html                 # Main public platform (Adoptions, Shop, Gallery, Cart Drawer)
├── script.js                  # Public frontend logic, cart state, dynamic rendering & Supabase client
├── styles.css                 # Platform styling, responsive grid systems, animations & variables
├── admin.html                 # Administrator portal (Tabs: Animals, Shop, Orders, Adoptions, Gallery)
├── admin.js                   # Administrative controller, CRUD operations & reordering
├── admin.css                  # Administrative portal theme and responsive styling
├── admin-login.html           # Secure administrator authentication & password recovery
├── admin/
│   └── index.html             # Safe redirect to admin.html
├── supabase-config.js         # Supabase client initialization & client-side image optimizer
├── supabase_schema.sql        # Database schema, tables, constraints, RPCs, and RLS policies
└── images/
    ├── logo.svg               # Scalable brand vector logo
    ├── logo.png               # High-resolution raster brand mark
    ├── logo.JPG               # Compatibility fallback asset
    ├── pet-adoption-showcase.png  # Rescue animal showcase banner
    └── pet-shop-supplies.png      # Pet shop supplies showcase banner
```

---

## 🚀 Setup & Local Development

### 1. Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge).
- A lightweight local HTTP server (Python, Node.js `serve`, VS Code Live Server, etc.).
- *(Optional)* A free [Supabase](https://supabase.com) account if you wish to link your own live database.

### 2. Running Locally
Clone this repository and launch a local web server:

```bash
# Using Python 3
python3 -m http.server 8000

# OR using npx
npx serve .
```

Open `http://localhost:8000` in your web browser.

### 3. Database Configuration (Supabase)
To connect your own database backend:
1. Create a project in [Supabase](https://supabase.com).
2. Navigate to the **SQL Editor** in your Supabase dashboard and execute the script in [`supabase_schema.sql`](supabase_schema.sql).
3. Create a public storage bucket named `animal-images`.
4. Update `SUPABASE_URL` and `SUPABASE_ANON_KEY` in [`supabase-config.js`](supabase-config.js).
5. Add your administrator user UUID to `public.admin_users` to grant access to the admin portal.

---

## 📋 Portfolio & Demonstration Notes

- **Demonstration Data**: Contact numbers (e.g., `+9710000000000`), sample addresses (`Dubai, UAE`), and placeholder messaging links are included as demonstration fixtures to showcase real-world workflows without disclosing proprietary client data.
- **Resilient Fallback Mode**: If network connectivity or database endpoints are temporarily unavailable, the public site smoothly falls back to built-in demonstration fixtures for products, rescue stories, and gallery images, ensuring a seamless browsing experience.
- **Currency & Regional Standards**: All pricing and transactions are standardized to US Dollars (`USD $`), utilizing standard US localization formatting.

---

## 👨‍💻 Key Contributions Demonstrated

- **Architecture & UI Design**: Built a cohesive, accessible, and responsive user experience from scratch without heavy UI framework bloat.
- **State Management in Vanilla JS**: Implemented a synchronized multi-tab shopping basket and adoption request workflow with `localStorage` persistence and cross-tab UI synchronization.
- **Relational Data & Security**: Authored production-grade PostgreSQL schemas, automated row-locking RPCs for inventory integrity, and granular Row-Level Security policies.
- **Performance Optimization**: Created client-side media compression pipelines using HTML5 Canvas to deliver fast uploads and bandwidth-friendly WebP assets.

---

## 📄 License
This project is open-source and available for portfolio, educational, and non-commercial demonstration purposes.
