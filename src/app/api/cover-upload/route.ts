// Uploading a cover or artist photo instead of linking one (Graham, 2026-11-25): admins and
// tier 3 editors only. The picture is checked like a linked one (JPEG, PNG or WebP, at least
// 500 × 500, under 10 MB), turned into a JPEG and kept in pending/ until the edit is published
// or rejected (see coverStore.ts). Returns its address, which the form uses as the link.
import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { checkImage, CoverError, MAX_BYTES } from "@/lib/coverFetch";
import { coverStorageReady, storePending } from "@/lib/coverStore";
import { can } from "@/lib/review";
import { getViewer } from "@/lib/viewer";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: NextRequest) {
  const v = await getViewer();
  if (!v) return fail("You've been signed out. Log in again.", 401);
  if (!can.publish(v)) return fail("Only tier 3 editors and admins can upload pictures. Paste a link instead.", 403);
  if (!coverStorageReady()) return fail("Picture storage isn't set up on this site yet.", 503);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 100_000) return fail("That picture is over 10 MB.");
  let file: File | null = null;
  try { file = (await request.formData()).get("file") as File | null; } catch { /* below */ }
  if (!file || typeof file === "string") return fail("Choose a picture to upload.");
  if (file.size > MAX_BYTES) return fail("That picture is over 10 MB.");
  try {
    const img = await checkImage(Buffer.from(await file.arrayBuffer()));
    const jpeg = await sharp(img.buffer, { limitInputPixels: 50_000_000 }).rotate()
      .resize(2400, 2400, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#000" })
      .jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    const url = await storePending(jpeg);
    return NextResponse.json({ url, width: img.width, height: img.height });
  } catch (e) {
    if (e instanceof CoverError) return fail(e.message.replace("That link isn't an image we can read", "That file isn't a picture we can read").replace("That image is", "That picture is"));
    console.error("cover upload", (e as Error).message);
    return fail("Couldn't save the picture. Try again in a moment.", 500);
  }
}
