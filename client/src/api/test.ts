import { getApiOrigin } from "../services/apiOrigin";

export async function pingServer() {
  const res = await fetch(`${getApiOrigin()}/`);
  return res.text();
}