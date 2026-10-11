export function creatorPlayStoreUrl(code: string) {
  return `https://play.google.com/store/apps/details?id=khasigpt.com&referrer=${encodeURIComponent(`creator_referral=${code}`)}`;
}
