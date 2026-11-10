/**
 * Supabase Configuration & Client Initialization
 * Project: PawHaven — Pet Adoption & E-Commerce Web Platform
 * Connects using the official @supabase/supabase-js client library
 */

const SUPABASE_URL = 'https://snedhbufolvvhrpzpprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_LtUQ0TKKY0fdMMnbJ8QS7A_a_YanX0L';
const STORAGE_BUCKET = 'animal-images';

// Ensure the Supabase client is initialized once the library is loaded
function getSupabaseClient() {
  if (window._supabaseInstance) {
    return window._supabaseInstance;
  }
  if (window.supabase && typeof window.supabase.createClient === 'function') {
    window._supabaseInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return window._supabaseInstance;
  }
  console.error('Supabase JS library not loaded. Please include @supabase/supabase-js.');
  return null;
}

// Expose client globally
window.getSupabaseClient = getSupabaseClient;
// Pre-initialize if library is already present
if (window.supabase) {
  window.supabaseClient = getSupabaseClient();
} else {
  // Otherwise initialize as soon as DOM loads or script is available
  window.addEventListener('DOMContentLoaded', () => {
    window.supabaseClient = getSupabaseClient();
  });
}

/**
 * Checks whether the given user_id exists in public.admin_users.
 * Returns true if authorized admin, false otherwise.
 */
async function verifyAdminUser(userId) {
  const client = getSupabaseClient();
  if (!client || !userId) return false;

  try {
    const { data, error } = await client
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error verifying admin authorization:', error);
      return false;
    }

    return Boolean(data && data.user_id === userId);
  } catch (err) {
    console.error('Unexpected error checking admin_users:', err);
    return false;
  }
}
window.verifyAdminUser = verifyAdminUser;

/**
 * Automatically optimizes an image file client-side before upload.
 * - Does NOT impose an arbitrary maximum file size limit.
 * - Resizes high-resolution photographs to web-ready dimensions (max 1920px) preserving aspect ratio.
 * - Converts to modern, efficient WebP format while preserving visual quality and transparency.
 * - Passes through videos, animated GIFs, and SVGs unmodified.
 * - Catches corrupted or invalid image files with clear, actionable error messages.
 */
async function optimizeImageForUpload(file, options = {}) {
  if (!file) return file;

  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);

  // Non-raster images or videos are uploaded as-is
  if (isVideo || isGif || isSvg) {
    return file;
  }

  // Ensure file is an image
  if (!file.type.startsWith('image/')) {
    return file;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Could not read the selected image file. Please check file permissions or try selecting another image.'));
    };

    reader.onload = (readerEvent) => {
      const img = new Image();

      img.onerror = () => {
        reject(new Error('The selected image is corrupted, unsupported, or could not be decoded. Please select a valid photo (JPEG, PNG, or WebP).'));
      };

      img.onload = () => {
        try {
          const naturalWidth = img.naturalWidth || img.width;
          const naturalHeight = img.naturalHeight || img.height;

          if (!naturalWidth || !naturalHeight) {
            return resolve(file);
          }

          // Target maximum display dimension (1920px is crisp on 4K retina screens while keeping bandwidth optimal)
          const maxDimension = options.maxDimension || 1920;
          let targetWidth = naturalWidth;
          let targetHeight = naturalHeight;

          if (targetWidth > maxDimension || targetHeight > maxDimension) {
            if (targetWidth > targetHeight) {
              targetHeight = Math.round((targetHeight * maxDimension) / targetWidth);
              targetWidth = maxDimension;
            } else {
              targetWidth = Math.round((targetWidth * maxDimension) / targetHeight);
              targetHeight = maxDimension;
            }
          }

          // If file is already small (<= 250KB) and within maxDimension, upload original directly
          if (file.size <= 250 * 1024 && naturalWidth <= maxDimension && naturalHeight <= maxDimension) {
            return resolve(file);
          }

          const canvas = document.createElement('canvas');
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            return resolve(file);
          }

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          // WebP format preserves quality, supports transparency, and delivers 70-90% smaller payload
          const outputFormat = 'image/webp';
          const outputQuality = 0.88;

          canvas.toBlob((blob) => {
            if (!blob) {
              return resolve(file);
            }

            // If optimized blob happens to be larger than original (e.g. tiny PNG), keep original
            if (blob.size >= file.size && naturalWidth === targetWidth && naturalHeight === targetHeight) {
              return resolve(file);
            }

            const safeBase = (file.name.substring(0, file.name.lastIndexOf('.')) || 'image')
              .replace(/[^a-zA-Z0-9_-]/g, '_');

            const optimizedFile = new File([blob], `${safeBase}.webp`, {
              type: 'image/webp',
              lastModified: Date.now()
            });

            resolve(optimizedFile);
          }, outputFormat, outputQuality);

        } catch (err) {
          console.warn('Image optimization canvas error, falling back to original:', err);
          resolve(file);
        }
      };

      img.src = readerEvent.target.result;
    };

    reader.readAsDataURL(file);
  });
}
window.optimizeImageForUpload = optimizeImageForUpload;

/**
 * Uploads a media file (image or video) to the animal-images bucket and returns its public URL.
 * Automatically optimizes images without rejecting files due to size.
 */
async function uploadMediaFile(file, options = {}) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase client not initialized');
  if (!file) throw new Error('No file provided for upload');

  const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(file.name);

  // Video size validation (max 50MB for video). Notice images have NO arbitrary size limit!
  if (isVideo && file.size > 50 * 1024 * 1024) {
    throw new Error(`Video file is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Max allowed size for videos is 50MB.`);
  }

  // Optimize image client-side before uploading (resizes dimensions, converts to WebP)
  let uploadFile = file;
  if (!isVideo) {
    try {
      uploadFile = await optimizeImageForUpload(file, options);
    } catch (optErr) {
      console.error('Image optimization error:', optErr);
      throw optErr;
    }
  }

  const fileExt = (uploadFile.name.split('.').pop() || (isVideo ? 'mp4' : 'webp')).toLowerCase();
  const safeBaseName = (uploadFile.name.substring(0, uploadFile.name.lastIndexOf('.')) || 'media')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .substring(0, 24);
  const fileName = `${Date.now()}_${safeBaseName}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;

  // Explicit content-type mapping ensures proper browser streaming and caching
  let contentType = uploadFile.type;
  if (!contentType || contentType === 'application/octet-stream') {
    if (fileExt === 'mp4') contentType = 'video/mp4';
    else if (fileExt === 'webm') contentType = 'video/webm';
    else if (fileExt === 'mov') contentType = 'video/quicktime';
    else if (fileExt === 'png') contentType = 'image/png';
    else if (fileExt === 'webp') contentType = 'image/webp';
    else contentType = 'image/jpeg';
  }

  const bucket = options.bucket || STORAGE_BUCKET;

  const { data, error } = await client.storage
    .from(bucket)
    .upload(fileName, uploadFile, {
      cacheControl: '31536000', // 1 year cache for immutable content
      contentType: contentType,
      upsert: false
    });

  if (error) {
    throw error;
  }

  const { data: urlData } = client.storage
    .from(bucket)
    .getPublicUrl(fileName);

  if (!urlData || !urlData.publicUrl) {
    throw new Error('Failed to retrieve public URL for uploaded media');
  }

  return urlData.publicUrl;
}
window.uploadMediaFile = uploadMediaFile;

/**
 * Backwards compatibility wrapper for animal photos
 */
async function uploadAnimalImage(file) {
  return uploadMediaFile(file);
}
window.uploadAnimalImage = uploadAnimalImage;


