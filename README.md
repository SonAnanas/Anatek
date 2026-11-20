# Anatek

Müşteri ve Araç modüllerini yap.

- Müşteri: ad, soyad, telefon, 2. telefon (ops.), adres (ops.), not. Ekle/düzenle/arşivle. Ad, soyad, telefonla arama. Aynı telefon varsa mükerrer uyarısı.

- Araç: plaka, marka, model, yıl, tip, şasi (ops.), motor (ops.), açıklama, müşteri. Bir müşterinin çok aracı olabilir.

- Plaka normalize edilsin (büyük harf, boşluksuz: "34 abc 123" = "34ABC123"). Üstteki arama kutusu normalize plakayla anında sonuç versin.

- Araç detay sayfası: araç + müşteri + telefon + kronolojik servis geçmişi (şimdilik boş liste).

- Müşteri detay sayfası: araçlar, geçmiş servisler, toplam/ödenen/ödenmeyen tutar (para birimi bazlı ayrı).

Örnek veri ekle (5 müşteri, 8 araç). bu işlemler olmuşmu kontrol et

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1dc57874-99fd-421d-a579-e506d20ef7fa).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
