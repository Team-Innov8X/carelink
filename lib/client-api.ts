export async function readApiJson<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`${fallback} (server returned an empty response, HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${fallback} (server returned an invalid response, HTTP ${response.status}).`);
  }
}
