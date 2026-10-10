/** Read JSON responses without leaking the browser's opaque JSON parse exception. */
export async function readApiResponse<T = any>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`Driver API returned ${response.status} ${response.statusText} with an empty response.`);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type';
    throw new Error(`Driver API returned ${response.status} ${response.statusText} as ${contentType}, not JSON. Refresh the page and try again.`);
  }
}
