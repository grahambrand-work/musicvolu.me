// An uploaded cover or photo waiting for review (see coverStore.ts): its address ends in
// album-covers/pending/<random id>.jpg. Shared by the forms (browser) and the review pages.
const PENDING_RE = /\/storage\/v1\/object\/public\/album-covers\/pending\/[0-9a-f-]{36}\.jpg$/;
export const isUpload = (v: unknown) => typeof v === "string" && PENDING_RE.test(v.trim());
