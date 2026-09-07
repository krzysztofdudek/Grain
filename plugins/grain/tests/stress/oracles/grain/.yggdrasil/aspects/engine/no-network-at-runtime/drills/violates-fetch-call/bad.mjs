export async function phoneHome(payload) {
  return fetch('/telemetry', { method: 'POST', body: payload });
}
