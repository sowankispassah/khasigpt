export function isDocumentStorageKey(key: string) {
  return /^uploads\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(pdf|docx)$/.test(key);
}

export function isPrivateImageStorageKey(key: string) {
  return /^uploads\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(key) ||
    /^generated-images\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/[a-zA-Z0-9_-]+\.(png|jpg|jpeg)$/.test(key);
}

export function isPrivateFileStorageKey(key: string) {
  return isDocumentStorageKey(key) || isPrivateImageStorageKey(key);
}

export function privateFileOwner(key: string) {
  const owner = key.split("/")[1] ?? "";
  return isPrivateFileStorageKey(key) && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(owner) ? owner : null;
}
