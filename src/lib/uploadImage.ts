import { auth } from "@/lib/firebase/client";

/** /api/upload needs the signed-in member's ID token (no anonymous uploads to Cloudinary). */
export async function uploadAuthHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Upload an image to Cloudinary via the `/api/upload` route and return its URL.
 * Shared by the settings page and the on-spot profile editors.
 */
export async function uploadImage(
  file: File,
  opts: { maxBytes?: number } = {}
): Promise<string> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;

  if (!file.type.startsWith("image/")) {
    throw new Error("Please select an image.");
  }
  if (file.size > maxBytes) {
    throw new Error(`Image must be less than ${Math.round(maxBytes / (1024 * 1024))}MB.`);
  }

  const fd = new FormData();
  fd.append("image", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd, headers: await uploadAuthHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(data.error || "Upload failed");
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
