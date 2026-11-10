-- ==============================================================================
-- PAWHAVEN — CONSOLIDATED SUPABASE DATABASE SCHEMA
-- ==============================================================================
-- Description: Consolidated, production-ready schema for Supabase (PostgreSQL).
-- Contains all database definitions for:
--   1. Administrator Authorization (admin_users, is_admin security function)
--   2. Adoptable Animals Management (animals table & RLS policies)
--   3. Online Pet Shop Products & Inventory (products table, constraints & RLS)
--   4. Gallery Albums (albums table & RLS policies)
--   5. Album Media Items (album_media table & RLS policies)
--   6. Legacy Gallery (gallery table for backward compatibility & RLS)
--   7. Gallery-to-Albums Safe Data Migration
--   8. Multi-Product Orders & Atomic Stock Management (orders table, indexes,
--      update_order_status & deliver_order RPCs with row-level locks)
--   9. Multi-Animal Adoption Applications (adoption_requests table, indexes & RLS)
--  10. Supabase Storage Policies (animal-images bucket)
--  11. PostgREST Schema Cache Reload
--
-- Instructions: Run this script in the Supabase SQL Editor
-- (Dashboard -> SQL Editor -> New Query -> Run)
-- ==============================================================================

-- ==============================================================================
-- SECTION 1: ADMINISTRATOR AUTHORIZATION & SECURITY FUNCTION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.admin_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Drop overloaded parameter variants with CASCADE to resolve any ambiguity
DROP FUNCTION IF EXISTS public.is_admin(UUID) CASCADE;

-- Centralized Security Definer function to verify administrator privileges
-- Avoids recursive RLS loops by running with elevated privileges
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE admin_users.user_id::text = auth.uid()::text
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- Row Level Security for admin_users
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view admin_users" ON public.admin_users;
CREATE POLICY "Admins can view admin_users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert admin_users" ON public.admin_users;
CREATE POLICY "Admins can insert admin_users"
  ON public.admin_users FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete admin_users" ON public.admin_users;
CREATE POLICY "Admins can delete admin_users"
  ON public.admin_users FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==============================================================================
-- SECTION 2: ADOPTABLE ANIMALS MANAGEMENT
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.animals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL,
  status TEXT DEFAULT 'available',
  animal_type TEXT DEFAULT 'dog',
  gender TEXT DEFAULT 'female',
  age_value NUMERIC DEFAULT 1,
  age_unit TEXT DEFAULT 'years',
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Upgrade existing animals table if columns were added later
ALTER TABLE public.animals ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available';
ALTER TABLE public.animals ADD COLUMN IF NOT EXISTS animal_type TEXT DEFAULT 'dog';
ALTER TABLE public.animals ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'female';
ALTER TABLE public.animals ADD COLUMN IF NOT EXISTS age_value NUMERIC DEFAULT 1;
ALTER TABLE public.animals ADD COLUMN IF NOT EXISTS age_unit TEXT DEFAULT 'years';
ALTER TABLE public.animals ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_animals_display_order ON public.animals(display_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_animals_status ON public.animals(status);

ALTER TABLE public.animals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view animals" ON public.animals;
DROP POLICY IF EXISTS "Admins can insert animals" ON public.animals;
DROP POLICY IF EXISTS "Admins can update animals" ON public.animals;
DROP POLICY IF EXISTS "Admins can delete animals" ON public.animals;

-- Public read access for adoptable animals listing
CREATE POLICY "Public can view animals"
  ON public.animals FOR SELECT
  TO public
  USING (true);

-- Authorized admin management policies
CREATE POLICY "Admins can insert animals"
  ON public.animals FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update animals"
  ON public.animals FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete animals"
  ON public.animals FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==============================================================================
-- SECTION 3: ONLINE PET SHOP PRODUCTS & INVENTORY
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price TEXT NOT NULL,
  image_url TEXT NOT NULL,
  display_order INT DEFAULT 0,
  stock_quantity INT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INT DEFAULT NULL;

-- Prevent inventory from dropping below zero
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_stock_non_negative') THEN
    ALTER TABLE public.products ADD CONSTRAINT chk_products_stock_non_negative
      CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_display_order ON public.products(display_order ASC, created_at DESC);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view products" ON public.products;
DROP POLICY IF EXISTS "Admins can insert products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;

CREATE POLICY "Public can view products"
  ON public.products FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can insert products"
  ON public.products FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update products"
  ON public.products FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete products"
  ON public.products FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==============================================================================
-- SECTION 4: GALLERY ALBUMS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_albums_display_order ON public.albums(display_order ASC, created_at DESC);

ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view albums" ON public.albums;
DROP POLICY IF EXISTS "Admins can insert albums" ON public.albums;
DROP POLICY IF EXISTS "Admins can update albums" ON public.albums;
DROP POLICY IF EXISTS "Admins can delete albums" ON public.albums;

CREATE POLICY "Public can view albums"
  ON public.albums FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can insert albums"
  ON public.albums FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update albums"
  ON public.albums FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete albums"
  ON public.albums FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==============================================================================
-- SECTION 5: ALBUM MEDIA ITEMS (IMAGES & VIDEOS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.album_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id UUID NOT NULL REFERENCES public.albums(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  media_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.album_media ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_album_media_album_id ON public.album_media(album_id);
CREATE INDEX IF NOT EXISTS idx_album_media_display_order ON public.album_media(display_order ASC, created_at DESC);

ALTER TABLE public.album_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view album_media" ON public.album_media;
DROP POLICY IF EXISTS "Admins can insert album_media" ON public.album_media;
DROP POLICY IF EXISTS "Admins can update album_media" ON public.album_media;
DROP POLICY IF EXISTS "Admins can delete album_media" ON public.album_media;

CREATE POLICY "Public can view album_media"
  ON public.album_media FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can insert album_media"
  ON public.album_media FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update album_media"
  ON public.album_media FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete album_media"
  ON public.album_media FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==============================================================================
-- SECTION 6: LEGACY GALLERY TABLE (BACKWARDS COMPATIBILITY)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.gallery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.gallery ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_gallery_display_order ON public.gallery(display_order ASC, created_at DESC);

ALTER TABLE public.gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view gallery" ON public.gallery;
DROP POLICY IF EXISTS "Admins can insert gallery photos" ON public.gallery;
DROP POLICY IF EXISTS "Admins can update gallery photos" ON public.gallery;
DROP POLICY IF EXISTS "Admins can delete gallery photos" ON public.gallery;

CREATE POLICY "Public can view gallery"
  ON public.gallery FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can insert gallery photos"
  ON public.gallery FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update gallery photos"
  ON public.gallery FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete gallery photos"
  ON public.gallery FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==============================================================================
-- SECTION 7: LEGACY GALLERY TO ALBUMS DATA MIGRATION
-- ==============================================================================

DO $$
DECLARE
  default_album_id UUID;
  rec RECORD;
  ord INT := 0;
BEGIN
  -- If legacy public.gallery has rows and public.albums has none, migrate smoothly
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gallery') THEN
    IF NOT EXISTS (SELECT 1 FROM public.albums) AND EXISTS (SELECT 1 FROM public.gallery) THEN
      INSERT INTO public.albums (title, description, display_order)
      VALUES (
        'Featured Moments & Rescue Activities',
        'Moments captured during rescue missions, sterilizations, and successful adoptions.',
        1
      )
      RETURNING id INTO default_album_id;

      FOR rec IN SELECT * FROM public.gallery ORDER BY created_at ASC LOOP
        ord := ord + 1;
        INSERT INTO public.album_media (album_id, media_type, media_url, caption, display_order, created_at)
        VALUES (default_album_id, 'image', rec.image_url, rec.title, ord, rec.created_at);
      END LOOP;
    END IF;
  END IF;
END $$;

-- ==============================================================================
-- SECTION 8: ORDERS TABLE & ATOMIC INVENTORY DEDUCTION
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no TEXT UNIQUE NOT NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT DEFAULT '',
  delivery_address TEXT NOT NULL,
  city TEXT NOT NULL,
  notes TEXT DEFAULT '',
  total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  stock_deducted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Upgrade existing orders table if columns/constraints need updates
ALTER TABLE public.orders ALTER COLUMN customer_email DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN customer_email SET DEFAULT '';
ALTER TABLE public.orders ALTER COLUMN notes DROP NOT NULL;
ALTER TABLE public.orders ALTER COLUMN notes SET DEFAULT '';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_orders_reference_no ON public.orders(reference_no);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Drop legacy trigger (orders must start as 'pending' WITHOUT deducting stock)
-- Stock deduction only occurs when order transitions to 'delivered'
DROP TRIGGER IF EXISTS trg_process_order_inventory ON public.orders;
DROP FUNCTION IF EXISTS public.process_order_inventory();

-- ATOMIC RPC FUNCTION: UPDATE ORDER STATUS & INVENTORY DEDUCTION
-- Uses PostgreSQL row-level locks (FOR UPDATE) to prevent concurrency races and overselling.
CREATE OR REPLACE FUNCTION public.update_order_status(
  p_order_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_items_arr JSONB;
  v_prod_id_text TEXT;
  v_prod_id UUID;
  v_qty INT;
  v_product RECORD;
  v_normalized_status TEXT;
BEGIN
  -- 1. Check admin authorization
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: only authorized administrators can update order status.';
  END IF;

  v_normalized_status := LOWER(TRIM(p_new_status));
  IF v_normalized_status NOT IN ('pending', 'confirmed', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid order status "%". Allowed values: pending, confirmed, delivered, cancelled.', p_new_status;
  END IF;

  -- 2. Lock target order row FOR UPDATE to prevent concurrent status updates
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order with ID "%" not found.', p_order_id;
  END IF;

  -- 3. Transition to 'delivered' -> Deduct stock atomically
  IF v_normalized_status = 'delivered' THEN
    -- Never deduct stock twice if order was already delivered or stock was previously deducted
    IF v_order.stock_deducted IS TRUE OR LOWER(COALESCE(v_order.status, '')) = 'delivered' THEN
      UPDATE public.orders
      SET status = 'delivered',
          stock_deducted = TRUE
      WHERE id = p_order_id;

      RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'delivered',
        'stock_deducted', true,
        'already_deducted', true,
        'message', 'Order marked as delivered (stock was already deducted).'
      );
    END IF;

    -- Normalize items JSONB array
    IF v_order.items IS NOT NULL THEN
      IF jsonb_typeof(v_order.items) = 'array' THEN
        v_items_arr := v_order.items;
      ELSIF jsonb_typeof(v_order.items) = 'string' THEN
        BEGIN
          v_items_arr := (v_order.items #>> '{}')::jsonb;
        EXCEPTION WHEN OTHERS THEN
          v_items_arr := '[]'::jsonb;
        END;
      ELSE
        v_items_arr := '[]'::jsonb;
      END IF;

      IF jsonb_typeof(v_items_arr) = 'array' THEN
        -- Pass 1: Acquire row locks FOR UPDATE on all products and verify stock availability
        FOR v_item IN SELECT * FROM jsonb_to_recordset(v_items_arr) AS x(product_id TEXT, id TEXT, quantity INT, product_name TEXT)
        LOOP
          v_prod_id_text := COALESCE(v_item.product_id, v_item.id);
          v_qty := COALESCE(v_item.quantity, 1);

          -- Only check tracked products with valid UUIDs
          IF v_prod_id_text IS NOT NULL AND v_prod_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND v_qty > 0 THEN
            v_prod_id := v_prod_id_text::UUID;

            SELECT id, name, stock_quantity INTO v_product
            FROM public.products
            WHERE id = v_prod_id
            FOR UPDATE;

            IF FOUND THEN
              IF v_product.stock_quantity IS NOT NULL THEN
                IF v_product.stock_quantity < v_qty THEN
                  RAISE EXCEPTION 'Insufficient stock for product "%": only % unit(s) available in stock, but % requested.',
                    COALESCE(v_product.name, v_item.product_name, 'Product'),
                    v_product.stock_quantity,
                    v_qty;
                END IF;
              END IF;
            END IF;
          END IF;
        END LOOP;

        -- Pass 2: Deduct quantities from products atomically
        FOR v_item IN SELECT * FROM jsonb_to_recordset(v_items_arr) AS x(product_id TEXT, id TEXT, quantity INT, product_name TEXT)
        LOOP
          v_prod_id_text := COALESCE(v_item.product_id, v_item.id);
          v_qty := COALESCE(v_item.quantity, 1);

          IF v_prod_id_text IS NOT NULL AND v_prod_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND v_qty > 0 THEN
            v_prod_id := v_prod_id_text::UUID;

            UPDATE public.products
            SET stock_quantity = stock_quantity - v_qty
            WHERE id = v_prod_id AND stock_quantity IS NOT NULL;
          END IF;
        END LOOP;
      END IF;
    END IF;

    -- Update order status and record stock deduction
    UPDATE public.orders
    SET status = 'delivered',
        stock_deducted = TRUE
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'status', 'delivered',
      'stock_deducted', true,
      'already_deducted', false,
      'message', 'Order delivered successfully and product stock deducted.'
    );

  -- 4. Transition to pending, confirmed, or cancelled (does not deduct stock)
  ELSE
    UPDATE public.orders
    SET status = v_normalized_status
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
      'success', true,
      'order_id', p_order_id,
      'status', v_normalized_status,
      'stock_deducted', COALESCE(v_order.stock_deducted, false),
      'message', 'Order status updated to ' || v_normalized_status
    );
  END IF;
END;
$$;

-- Helper RPC deliver_order for direct delivery calls
CREATE OR REPLACE FUNCTION public.deliver_order(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.update_order_status(p_order_id, 'delivered');
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deliver_order(UUID) TO authenticated;

-- Row Level Security for orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can view orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;

-- Anyone can submit an order during public checkout
CREATE POLICY "Public can insert orders"
  ON public.orders FOR INSERT
  TO public
  WITH CHECK (true);

-- Only authorized administrators can view, update, or delete orders
CREATE POLICY "Admins can view orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete orders"
  ON public.orders FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==============================================================================
-- SECTION 9: ADOPTION REQUESTS TABLE & RLS POLICIES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.adoption_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_no TEXT UNIQUE NOT NULL,
  applicant_name TEXT NOT NULL,
  applicant_phone TEXT NOT NULL,
  applicant_email TEXT DEFAULT '',
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  housing_type TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  animals JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure applicant_email and housing_type columns are supported gracefully
ALTER TABLE public.adoption_requests ALTER COLUMN applicant_email DROP NOT NULL;
ALTER TABLE public.adoption_requests ALTER COLUMN applicant_email SET DEFAULT '';
ALTER TABLE public.adoption_requests ADD COLUMN IF NOT EXISTS housing_type TEXT DEFAULT '';
ALTER TABLE public.adoption_requests ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_adoption_requests_reference_no ON public.adoption_requests(reference_no);
CREATE INDEX IF NOT EXISTS idx_adoption_requests_status ON public.adoption_requests(status);
CREATE INDEX IF NOT EXISTS idx_adoption_requests_created_at ON public.adoption_requests(created_at DESC);

ALTER TABLE public.adoption_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert adoption_requests" ON public.adoption_requests;
DROP POLICY IF EXISTS "Admins can view adoption_requests" ON public.adoption_requests;
DROP POLICY IF EXISTS "Admins can update adoption_requests" ON public.adoption_requests;
DROP POLICY IF EXISTS "Admins can delete adoption_requests" ON public.adoption_requests;

-- Anyone can submit an adoption application
CREATE POLICY "Public can insert adoption_requests"
  ON public.adoption_requests FOR INSERT
  TO public
  WITH CHECK (true);

-- Only authorized administrators can view, review, or manage adoption applications
CREATE POLICY "Admins can view adoption_requests"
  ON public.adoption_requests FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can update adoption_requests"
  ON public.adoption_requests FOR UPDATE
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins can delete adoption_requests"
  ON public.adoption_requests FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ==============================================================================
-- SECTION 10: SUPABASE STORAGE BUCKET & POLICIES (animal-images)
-- ==============================================================================

-- Ensure public animal-images storage bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('animal-images', 'animal-images', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can view animal images" ON storage.objects;
CREATE POLICY "Public can view animal images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'animal-images');

DROP POLICY IF EXISTS "Admins can upload animal images" ON storage.objects;
CREATE POLICY "Admins can upload animal images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'animal-images' AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update animal images" ON storage.objects;
CREATE POLICY "Admins can update animal images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'animal-images' AND public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can delete animal images" ON storage.objects;
CREATE POLICY "Admins can delete animal images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'animal-images' AND public.is_admin()
  );

-- ==============================================================================
-- SECTION 11: RELOAD SUPABASE POSTGREST SCHEMA CACHE
-- ==============================================================================

NOTIFY pgrst, 'reload schema';
