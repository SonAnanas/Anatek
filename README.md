# Anatek

Oto servisler ve tamirhaneler için servis, müşteri, araç, ödeme ve bakım takip uygulaması.
Kayıtlar cihazın kendi içinde tutulur; temel işler için internet gerekmez (yalnızca SMS gönderimi internet ister).

## Neler yapar
- **Kayıtlar:** müşteri, araç, servis (iş emri), servis kalemleri, çalışanlar; plaka ile hızlı arama; araç ve müşteri geçmişi.
- **Servis takibi:** kanban ve liste görünümü, kendi durumlarını ekleme. Servis durumu ile ödeme durumu birbirinden bağımsızdır.
- **Para:** kısmi ödeme, kalan borç, iade/iptal, gelir-gider, ciro ve tahsilat ayrı hesaplanır. TL, USD ve EUR hiçbir yerde birleştirilmez.
- **Bakım hatırlatıcı:** yağ, filtre, fren, muayene vb. için tarih ve aralık; Genel bakışta yaklaşanlar.
- **SMS:** servis tamamlanınca müşteriye bilgilendirme (İleti Merkezi). Şablonlar, geçmiş, yeniden gönderme.
- **Güvenlik:** tek dosyada yedek (isteğe bağlı parola, bütünlük kontrolü), güvenli geri yükleme, iki aşamalı silme ve geri alma, Veri Sağlığı denetimi.
- **Diğer:** açık/koyu tema, klavye kısayolları, raporlar, değişiklik kayıtları.

## Kurulum (kullanıcı)
İndirme sayfasından cihazınıza uygun dosyayı indirin:
- **Windows:** `Anatek-Kurulum.exe` (imzasız olduğu için Windows uyarı verirse “Ek bilgi → Yine de çalıştır”). Eski Anatek varsa kurulum verilerinizi saklamayı veya temiz kurulumu sorar; veriler silinmeden önce Belgeler\Anatek Yedekleri klasörüne güvenlik kopyası alınır.
- **Android:** `Anatek.apk` (“bilinmeyen kaynaktan yükleme” izni gerekir).

Adım adım yayın ve kurulum için: **BASLA-BURADAN.md**. SMS kurulumu ve test sırası: **MOBIL-KURULUM.md**.

## Veriler ve yedek
- Veriler cihaza özgüdür; telefon, tablet ve bilgisayar birbirine otomatik bağlanmaz. Tek bir ana cihaz seçmeniz önerilir.
- Windows’ta veri klasörü `%APPDATA%\Anatek`; kaldırma ve güncelleme buna dokunmaz.
- Düzenli **Veri yedekleme → Yedek Oluştur** yapın ve dosyayı başka bir yere de kopyalayın.
- SMS anahtarları cihazda saklanır, yedeğe konmaz.

## Sürüm ve güncelleme
Ayarlar → Hakkında: sürüm, derleme numarası, **Sürüm notları** ve “Güncelleme var mı?” (yayındaki sürüm, tarih ve notlar). Windows’ta “Güncelle ve kur”: kurulum dosyası indirilir, yayındaki `SHA256SUMS.txt` ile SHA-256 doğrulanır, bozuk dosya çalıştırılmaz; internet, disk veya iptal sorunlarında mevcut uygulama değişmez. Yeni sürüm olunca Genel bakışta uyarı çıkar.

## Geliştirici notları
React + TanStack Router (tek sayfa uygulama). Tüm veri erişimi tek katmandan geçer (`src/lib/repository.ts`); kayıt kuralları ve doğrulamalar orada. Windows kabuğu Electron, Android kabuğu Capacitor.

```
npm install --legacy-peer-deps
npm test                  # otomatik testler
npm run build:mobile      # derleme (sürüm ve derleme bilgisini yazar, web dosyalarını hazırlar)
```

**Yeni sürüm çıkarma:** `package.json` içindeki sürümü artırın ve `src/lib/release-notes.ts` dosyasının en üstüne o sürümün notunu ekleyin. Not eklenmezse derleme durur.

**Yayın:** GitHub’a her yüklemede “Yayinla” akışı kendiliğinden çalışır: testleri koşar, Android ve Windows dosyalarını derler, “son-surum” yayınını ve indirme sayfasını günceller. Derleme numarası uygulamada Hakkında’da görünür.

## Bilinen sınırlar
- Çok cihaz eşitlemesi yok (veriler cihazda).
- Tarayıcı depolaması sınırlıdır; Genel bakış ve Yedekleme sayfası doluluk konusunda uyarır. Fotoğraf desteği henüz yok.
- Gerçek SMS yalnızca Android ve Windows uygulamasında çalışır (tarayıcıda değil).
- Windows kurulum dosyası dijital imzasızdır (SHA-256 doğrulaması bozuk/eksik indirmeyi yakalar, yayıncıyı kanıtlamaz).
- Kurulum sihirbazı adımları (Evet/Hayır/İptal, güvenlik kopyası) gerçek Windows’ta elle denenmelidir; adımlar BASLA-BURADAN.md içinde.
