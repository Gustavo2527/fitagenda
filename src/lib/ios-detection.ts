export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

export function getIOSVersion(): number | null {
  if (!isIOS()) return null;
  const match = navigator.userAgent.match(/OS (\d+)_(\d+)/);
  if (!match) return null;
  return parseFloat(`${match[1]}.${match[2]}`);
}

export function supportsIOSNotifications(): boolean {
  const version = getIOSVersion();
  if (version === null) return false;
  return version >= 16.4;
}
