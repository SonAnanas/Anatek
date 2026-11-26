# ANATEK - TEK YONTEM (ilk kurulum ve guncelleme AYNI)

Hicbir seyin ustune kopyalamak yok. Eski depoyu silip ayni adla yenisini aciyoruz.
Adres ayni kalir: https://KULLANICI-ADIN.github.io/Anatek/
Telefondaki / bilgisayardaki kayitlar ETKILENMEZ.

A) ESKISINI SIL (sadece daha once kurduysan)
 1. GitHub'da eski depoyu ac > Settings > en alta in > "Delete this repository" > depo adini yaz > onayla.
 2. GitHub Desktop'ta eski depoya sag tikla > "Remove" > "Just remove". Masaustundeki eski Anatek klasorunu Geri Donusum Kutusu'na at.

B) YENISINI KUR
 1. Bu zip'e sag tikla > "Tumunu ayikla" > Masaustu. "Anatek" adinda yeni bir klasor olusur.
 2. GitHub Desktop > File > Add local repository > bu Anatek klasorunu sec > mavi "create a repository" yazisina tikla > Create repository.
 3. Sol alttaki Summary kutusuna "surum" yaz > "Commit to main".
 4. Ustte "Publish repository" > adi: Anatek > "Keep this code private" TIKINI KALDIR > Publish repository.
 5. GitHub'da depoyu ac > Settings > Pages > Source: "GitHub Actions" sec.
 6. Actions sekmesinde "Yayinla" calismasini bekle (10-15 dk). Calisma baslamazsa: Actions > Yayinla > Run workflow.
 7. Yesil olunca indirme sayfasi hazir: https://KULLANICI-ADIN.github.io/Anatek/
    Bu adresi arkadasina WhatsApp'tan gonder.

Calisma 30 dakikadan uzun surerse kendiliginden hata verip durur. Hata olursa kirmizi adima tikla, son 30 satiri bana yapistir.

SURUMUN GUNCEL OLDUGUNU NASIL ANLARIM?
 - Her yuklemede (Commit + Push) "Yayinla" calismasi KENDILIGINDEN baslar (dal adi ne olursa olsun). Actions sekmesinde yeni bir calisma gorursun.
 - Calismanin numarasi (#57 gibi) indirme sayfasinda ve GitHub "Releases" bolumunde "derleme 57" olarak yazar.
 - Uygulamada: Ayarlar > Hakkinda'da "Surum 1.2.1 - Derleme #57" yazar; soldaki menunun altinda da gorunur.
   Bu numara Actions'taki son yesil calismanin numarasindan kucukse ESKI surumu aciyorsun demektir: yeni dosyayi indirip kur.
 - "Guncelleme var mi?" dugmesi (Ayarlar > Hakkinda) yeni surum yayinlandiysa seni uyarir.

ESKI ANATEK VARSA (Windows kurulumu)
 Kurulum dosyasi eski bir Anatek bulursa sorar:
  EVET   = Eski verilerim saklansin (onerilen). Veriler %APPDATA%\Anatek klasorunde durur; yeni surum aynen kullanir.
  HAYIR  = Temiz kurulum. Ikinci bir uyari gelir; onaylarsan eski veriler silinir.
  IPTAL  = Kurulumdan vazgec.
 Her iki durumda da (Evet veya Hayir) eski veriler SILINMEDEN ONCE Belgeler\Anatek Yedekleri\son-guncelleme-oncesi klasorune
 guvenlik kopyasi alinir (icindeki Okubeni.txt geri yuklemeyi anlatir). Kopya alinamazsa temiz kurulumda HICBIR SEY silinmez.
 Eski surumlerin klasor adlari (UstaServisTakip / usta-servis-takip) varsa, veriler uygulama ilk acilista yeni klasore
 tek tek dogrulanarak (boyut + SHA-256) aktarilir; eski klasor silinmez; hata olursa eski veri oldugu gibi kalir.
 Android'de yeni APK eskisinin ustune kurulur, veriler korunur. Temiz baslangic icin: Ayarlar > Uygulamalar > Anatek > Depolama > Verileri sil.

UYGULAMA ICINDEN GUNCELLEME (Windows)
 Ayarlar > Hakkinda > "Guncelleme var mi?" yayindaki surumu, tarihini ve notlarini gosterir. Yeni surum varsa "Guncelle ve kur":
 kurulum dosyasi indirilir (ilerleme gorunur, iptal edilebilir), yayindaki SHA256SUMS.txt ile SHA-256 dogrulanir, dogrulanirsa kurulum acilir.
 Bozuk/dogrulanamayan dosya silinir ve CALISTIRILMAZ. Internet kesilirse, disk yetmezse veya iptal edilirse mevcut uygulama degismez.
 Kurulum "mevcut Anatek" diye sorunca EVET'i sec. Dijital imza yoktur (sertifika gerekir); SHA-256 bozuk/eksik indirmeye karsi korur.
 Android ve tarayicida "Indirme sayfasini ac" baglantisi cikar.

KURULUM TESTI (Windows'ta bir kez, gercek makinede)
 1. Eski Anatek'e birkac test verisi gir. Yeni kurulum dosyasini calistir > EVET > kurulum bitince veriler duruyor mu? Belgeler\Anatek Yedekleri klasoru olustu mu?
 2. Tekrar calistir > HAYIR > uyariyi onayla > Anatek bos acilmali; Anatek Yedekleri klasorunde onceki veri kopyasi durmali.
 3. Tekrar calistir > IPTAL > hicbir sey degismemeli.
 4. Temiz bilgisayarda (Anatek yok) kurulum soru sormadan kurulmali, masaustu kisayolu olusmali.
 5. Uygulamada Hakkinda > Guncelleme var mi? > (yeni surum varsa) Guncelle ve kur > kurulum acilmali.
