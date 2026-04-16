export const config = {
  api: {
    bodyParser: {
      sizeLimit: "20mb",
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY environment variable is not set" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();

    if (!text || text.trim() === "") {
      return res.status(502).json({ error: `Empty response from Anthropic. HTTP status: ${response.status}` });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: `Non-JSON from Anthropic. Status: ${response.status}. Body: ${text.slice(0, 300)}` });
    }

    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: `Proxy fetch failed: ${err.message}` });
  }
}
