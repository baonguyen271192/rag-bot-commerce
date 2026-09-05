export function createBackendClient({ baseUrl, fetchImpl = fetch } = {}) {
  return { baseUrl, fetchImpl };
}
