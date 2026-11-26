import { smsLength } from "@/lib/repository";

const CHARSET_LABEL = { gsm: "İngilizce karakter", turkish: "Türkçe karakter", unicode: "özel karakter (emoji vb.)" } as const;

export function SmsCounter({ text }: { text: string }) {
  const l = smsLength(text);
  return (
    <p className="text-sm text-muted-foreground">
      {l.chars} karakter · {l.tooLong ? <b className="text-destructive">{l.parts} SMS: çok uzun, en fazla 7 SMS (≈1000 karakter) gönderilebilir</b> : l.parts <= 1 ? "1 SMS" : <b className="text-destructive">{l.parts} SMS (kontör katlanır)</b>} · {CHARSET_LABEL[l.charset]}, ilk SMS sınırı {l.limit}
    </p>
  );
}
