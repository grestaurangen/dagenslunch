const INSTAGRAM_API_URL = "https://graph.instagram.com/me/media";
const DEFAULT_FIELDS = "id,caption,permalink,media_type,media_url,thumbnail_url,timestamp";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: "INSTAGRAM_ACCESS_TOKEN saknas." });
  }

  try {
    const params = new URLSearchParams({
      fields: DEFAULT_FIELDS,
      limit: "1",
      access_token: accessToken
    });

    const apiResponse = await fetch(`${INSTAGRAM_API_URL}?${params.toString()}`);
    const payload = await apiResponse.json();

    if (!apiResponse.ok) {
      console.error("Instagram API-fel:", payload);
      const message = payload?.error?.message || "Misslyckades att läsa Instagram-data.";
      return res.status(apiResponse.status).json({ error: message });
    }

    const latest = payload?.data?.[0];
    if (!latest) {
      return res.status(404).json({ error: "Inga inlägg hittades." });
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate");
    return res.status(200).json({
      permalink: latest.permalink,
      caption: latest.caption || "",
      mediaType: latest.media_type,
      mediaUrl: latest.media_url || latest.thumbnail_url || "",
      timestamp: latest.timestamp
    });
  } catch (error) {
    console.error("Instagram-förfrågan misslyckades:", error);
    return res.status(500).json({ error: "Internt serverfel." });
  }
}

