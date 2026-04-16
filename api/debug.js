export default function handler(req, res) {
  const key = process.env.ANTHROPIC_API_KEY;
  res.status(200).json({
    keyExists: !!key,
    keyPrefix: key ? key.slice(0, 20) : "NOT SET",
    keyLength: key ? key.length : 0,
  });
}
