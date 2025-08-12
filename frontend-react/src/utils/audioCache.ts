export type AudioHandle = HTMLAudioElement;

const audioCache = new Map<string, AudioHandle>();

export function getAudioEl(name: string): AudioHandle {
  let h = audioCache.get(name);
  if (!h) {
    h = new Audio(`/api/audio/${name}`);
    h.preload = "auto";
    audioCache.set(name, h);
  }
  return h;
}
