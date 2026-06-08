import { defaultSettings } from "./_core.js";

export default async function handler(req, res) {
  if (req.method === "POST") {
    return res.status(200).json({ ok: true, settings: req.body?.settings || defaultSettings });
  }
  return res.status(200).json({ ok: true, settings: defaultSettings });
}
