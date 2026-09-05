export function createBridgeClient({ baseUrl, fetchImpl = fetch } = {}) {
  return { baseUrl, fetchImpl };
}
