export function stream(url) {
  const socket = new WebSocket(url);
  return socket;
}
