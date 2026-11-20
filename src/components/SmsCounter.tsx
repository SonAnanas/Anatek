import { smsLength } from "@/lib/repository";

export function SmsCounter({ text }: { text: string }) {
  const l = smsLength(text);
  return <p className="text-sm text-muted-foreground">{l.chars} karakter · {l.parts} SMS{l.unicode ? " · Türkçe karakter içerir (70/67)" : " (160/153)"}</p>;
}
