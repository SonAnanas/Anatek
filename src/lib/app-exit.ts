// "Çıkış" düğmesi: Windows'ta uygulamayı kapatır, Android'de uygulamadan çıkar. Tarayıcıda düğme gösterilmez.
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export const canExit = () => typeof window !== "undefined" && (!!window.masaustu?.quit || Capacitor.isNativePlatform());

export async function exitApp(): Promise<void> {
  if (typeof window !== "undefined" && window.masaustu?.quit) { await window.masaustu.quit(); return; }
  if (Capacitor.isNativePlatform()) await App.exitApp();
}
