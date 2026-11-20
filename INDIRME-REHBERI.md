# Arkadasina verilecek indirme sayfasi - TEK SEFERLIK KURULUM

1. Zip'in icindekileri GitHub deposuna yukle (Commit + Push). Depo PUBLIC (herkese acik) olmali:
   GitHub > depo > Settings > General > en altta "Change visibility" > Make public.
   (Neden: arkadasin GitHub hesabi olmadan indirebilsin diye. Depoda musteri verisi yok, sadece program kodu var.)
2. GitHub > depo > Settings > Pages > "Build and deployment" > Source: **GitHub Actions** sec.
3. Actions sekmesinde "Yayinla" calismasini bekle (10-15 dk). Yesil olunca adres hazir:
   https://KULLANICI-ADIN.github.io/DEPO-ADI/
4. Bu adresi WhatsApp'tan arkadasina gonder. Telefondan acinca Android, bilgisayardan acinca Windows indirme dugmesi one cikar.
5. Her yeni commit'te sayfa ve indirme dosyalari otomatik guncellenir; adres degismez.
Sayfa acilmazsa 2. adimi kontrol et ve Actions'ta "Yayinla > sayfa" isini tekrar calistir.
