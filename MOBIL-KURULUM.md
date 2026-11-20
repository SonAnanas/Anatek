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
GitHub > Actions > "Windows EXE" calismasi > en alttaki "Anatek-exe" dosyasini indir, zip'i ac. Icinde iki dosya var:
- Anatek-Kurulum.exe : NORMAL KURULUM. Cift tikla, kendi kurulur, masaustune ve Baslat menusune "Anatek" kisayolu koyar. Yonetici sifresi istemez.
- Anatek-Tasinabilir.exe : kurulumsuz, USB'den calisir.
Windows "Bilinmeyen yayinci" uyarisi verirse "Ek bilgi > Yine de calistir" de (dosya imzali degil).
Kaldirmak icin: Ayarlar > Uygulamalar. Veriler kaldirmada SILINMEZ, su klasorde kalir: %APPDATA%\Anatek

# Birden fazla cihaz (telefon + tablet + bilgisayar)
Her cihazin verisi KENDI icinde ayridir, birbirleriyle otomatik senkron OLMAZ.
Tek bir "ana cihaz" sec; kayitlari orada gir. Diger cihaza veri tasimak icin: ana cihazda Yedek Olustur > dosyayi diger cihaza at > orada Yedekten Geri Yukle.

# Gercek SMS (Ileti Merkezi) kurulumu
1. panel.iletimerkezi.com'da uye ol, Ayarlar > Guvenlik > Erisim Izinleri'nden "API erisimine izin ver"i ac.
2. Ayarlar > Guvenlik > API Erisimi'nden API anahtari ve Hash'i kopyala.
3. Ayarlar > SMS'ten Turkce karakter (Universal Language Support) seceneklerini ac, yoksa "s" "g" "i" harfleri bozuk gider.
4. Uygulamada Ayarlar > "Gercek SMS gonder" ac. Gonderici basligini yaz (onay cikana kadar test icin APITEST yazilabilir; bu durumda mesaj metni sabit bir test metniyle degisir).
5. API anahtari ve Hash'i gir, kendi numarana "Test SMS gonder" ile dene.
6. Calisiyorsa gonderici basligini onayli baslikla degistir.
Notlar: Gercek gonderim sadece Android ve Windows uygulamasinda calisir (tarayicida degil). Ayni mesaj ayni numaraya kisa surede tekrar gonderilirse firma 451 hatasi verir. Anahtarlar cihazda saklanir ve yedek dosyasina konmaz.
