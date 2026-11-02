/** 访客预览开关：只存在本标签页的 sessionStorage 里，关掉标签页即退出。 */
const KEY = "guest_preview";

export function isGuestMode(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setGuestMode(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 访客点了写操作时广播，NavBar 收到后弹一条提示。 */
export const GUEST_BLOCKED_EVENT = "guest-blocked";
