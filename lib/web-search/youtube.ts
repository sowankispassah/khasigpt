const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

function isYouTubeHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "youtu.be" ||
    normalized === "youtube.com" ||
    normalized.endsWith(".youtube.com")
  );
}

export function getYouTubeVideoId(value: string) {
  try {
    const url = new URL(value);
    if (!isYouTubeHostname(url.hostname)) {
      return null;
    }

    const pathSegments = url.pathname.split("/").filter(Boolean);
    const candidate =
      url.hostname.toLowerCase() === "youtu.be"
        ? pathSegments[0]
        : url.pathname === "/watch"
          ? url.searchParams.get("v")
          : ["embed", "shorts", "live", "v"].includes(pathSegments[0] ?? "")
            ? pathSegments[1]
            : null;

    return candidate && YOUTUBE_VIDEO_ID_PATTERN.test(candidate)
      ? candidate
      : null;
  } catch {
    return null;
  }
}

export function getYouTubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeEmbedUrl(videoId: string) {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
}
