import { getDashboardPayload } from "./_core.js";

export default async function handler(req, res) {
  try {
    const payload = await getDashboardPayload();
    res.status(200).json(payload);
  } catch (error) {
    res.status(500).json({ ok: false, loading: false, error: error.message, dashboard: null });
  }
}
