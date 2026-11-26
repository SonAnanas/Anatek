# Android APK nasil alinir (bilgisayara bir sey kurmadan)

1. Bu klasoru GitHub'a yukle (Lovable'dan baglanan depoya bu dosyalari ekle, ya da yeni bir depo ac).
2. GitHub'da depo > Actions sekmesi > "Android APK" > Run workflow.
3. 5-10 dakika sonra bitince calisma sayfasinin altindaki "Anatek-apk" dosyasini indir (zip icinden app-debug.apk cikar).
4. APK'yi telefona at, ac. "Bilinmeyen kaynaklardan yukleme" izni isterse ver.

## ONEMLI
- Veriler telefonun icinde saklanir. Uygulamayi GUNCELLERKEN eski uygulamayi SILME, uzerine kur (imza sabit, veriler korunur).
- Telefon degisirse / uygulama silinirse veriler gider: duzenli "Yedek Olustur" yap ve dosyayi baska yere kopyala.
- Android Studio ile elle derlemek istersen: npm install --legacy-peer-deps, npm run build:mobile, npx cap sync android, npx cap open android.
- android/app/debug.keystore dosyasini KAYBETME ve baskasina verme; yeni imza ile kurulan APK eskisinin ustune kurulamaz.

# Windows (bilgisayar) icin kurulum
Arkadasina indirme sayfasinin adresini gonder (BASLA-BURADAN.md). Sayfadaki "Windows icin Indir" dugmesi Anatek-Kurulum.exe'yi indirir.
- Cift tikla, kendi kurulur; masaustune ve Baslat menusune "Anatek" kisayolu koyar. Yonetici sifresi istemez.
- Windows "Bilinmeyen yayinci" uyarisi verirse "Ek bilgi > Yine de calistir" de (dosya imzali degil).
- Kapatmak icin soldaki menunun altindaki "Cikis" dugmesi veya pencerenin X'i. Kaldirmak icin Ayarlar > Uygulamalar.
- Veriler kaldirmada SILINMEZ, su klasorde kalir: %APPDATA%\Anatek

# Birden fazla cihaz (telefon + tablet + bilgisayar)
Her cihazin verisi KENDI icinde ayridir, birbirleriyle otomatik senkron OLMAZ.
Tek bir "ana cihaz" sec; kayitlari orada gir. Diger cihaza veri tasimak icin: ana cihazda Yedek Olustur > dosyayi diger cihaza at > orada Yedekten Geri Yukle.

# Gercek SMS (Ileti Merkezi) kurulumu ve test sirasi
Ileti Merkezi'nin ayri bir "deneme sunucusu" yoktur; ayni anahtar gercek gonderim yapar ve kontor harcar. Bu yuzden sirayla ilerle:
1. panel.iletimerkezi.com'da uye ol (yeni hesaba 100 deneme SMS'i tanimlanir). Ayarlar > Guvenlik > Erisim Izinleri'nden "API erisimine izin ver"i ac. Ayni sayfadan API anahtari ve Hash'i kopyala.
2. Panelde Turkce karakter (Universal Language Support) ayarini ac; yoksa ş ğ ı harfleri Ingilizce'ye cevrilir.
3. Uygulamada Ayarlar > "Gercek SMS gonder"i ac, anahtar ve hash'i gir, KAYDET.
4. "Baglantiyi test et" dugmesine bas. Kontor harcamaz, SMS gondermez. "Baglanti basarili, bakiye ..." yaziyorsa anahtarlar, panel izni ve internet dogrudur.
5. Gonderici basligi: onayli basligin yoksa APITEST yaz. APITEST'te mesaj metni firmanin sabit deneme metni olur (bizim yazdigimiz metin gitmez); sadece baglantinin calistigini gosterir.
6. "Test SMS gonder" ile KENDI numarana bir mesaj at. Mesaj "TEST Anatek SMS <tarih saat>" diye baslar. Gercek gonderimde kontor duser. Baska birinin numarasini yazma.
7. Baslik onayi (panelde abonelik basvurusu + e-Devlet onayi, 1-2 is gunu) cikinca: "Baglantiyi test et" > cikan "Baslik olarak kullan: ..." dugmesine bas. Onayli baslik varken APITEST artik calismaz (450 hatasi).
8. Tekrar Test SMS at. Bu kez TEST metni aynen gelmeli, Turkce harfler dogru gorunmeli.
Mesaj uzunlugu (ilk SMS siniri): Ingilizce 155, Turkce 150, ozel karakter/emoji 65. Sablon duzenlerken sayac bunu gosterir; sinir asilirsa kontor katlanir.
Ayni mesaj ayni numaraya kisa surede tekrar gonderilirse firma 451 (tekrar) hatasi verir; Test SMS metni bu yuzden her seferinde farklidir.
Gercek gonderim sadece Android ve Windows uygulamasinda calisir (tarayicida degil). Anahtarlar cihazda saklanir, yedege konmaz; depoya (GitHub) ASLA yazma.
Servis "Tamamlandi" olunca musteriye giden mesaj bilgilendirme mesajidir (iys: "0"); hatirlatma/kampanya mesaji eklenirse firmaya sor.
