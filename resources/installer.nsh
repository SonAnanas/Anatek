; Anatek kurulum sihirbazı (electron-builder NSIS).
; Mevcut Anatek varsa sorar: verileri koru (varsayılan davranış) ya da temiz kurulum.
; Güncellemede ve temiz kurulumda eski veriler SİLİNMEDEN önce Belgeler\Anatek Yedekleri klasörüne güvenlik kopyası alınır;
; kopya alınamazsa temiz kurulumda hiçbir şey silinmez. Veriler %APPDATA%\Anatek klasöründedir; kaldırma ve güncelleme dokunmaz.
; Eski klasör adlarından (UstaServisTakip, usta-servis-takip) aktarım uygulama ilk açılışında, doğrulanarak yapılır.

; Değişkenler yalnızca kurucu derlemesinde tanımlanır (kaldırıcı derlemesinde kullanılmadığı için uyarı verirdi).
!ifndef BUILD_UNINSTALLER
  Var AnatekClean
  Var AnatekBak
  Var AnatekOK
  Var AnatekFh
!endif

; Bir veri klasörünün (Local Storage + IndexedDB) güvenlik kopyasını alır; alınamazsa $AnatekOK = 0 olur.
!macro AnatekBackupDir NAME
  ${If} ${FileExists} "$APPDATA\${NAME}\Local Storage\*.*"
    CreateDirectory "$AnatekBak\${NAME}\Local Storage"
    CopyFiles /SILENT "$APPDATA\${NAME}\Local Storage\*.*" "$AnatekBak\${NAME}\Local Storage"
    ${IfNot} ${FileExists} "$AnatekBak\${NAME}\Local Storage\*.*"
      StrCpy $AnatekOK "0"
    ${EndIf}
  ${EndIf}
  ${If} ${FileExists} "$APPDATA\${NAME}\IndexedDB\*.*"
    CreateDirectory "$AnatekBak\${NAME}\IndexedDB"
    CopyFiles /SILENT "$APPDATA\${NAME}\IndexedDB\*.*" "$AnatekBak\${NAME}\IndexedDB"
    ${IfNot} ${FileExists} "$AnatekBak\${NAME}\IndexedDB\*.*"
      StrCpy $AnatekOK "0"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInit
  StrCpy $AnatekClean "0"
  ${IfNot} ${Silent}
    ReadRegStr $0 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${If} $0 == ""
      ReadRegStr $0 HKLM "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${EndIf}
    ${If} $0 != ""
    ${OrIf} ${FileExists} "$APPDATA\Anatek\*.*"
      MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "Anatek uygulaması bu bilgisayarda mevcuttur. Eski sürüm silinip yeniden yüklenecektir.$\r$\n$\r$\nEVET: Eski verilerim saklansın ve yeni sürüme aktarılsın (önerilir)$\r$\nHAYIR: Temiz kurulum (eski veriler silinir)$\r$\nİPTAL: Kurulumdan vazgeç$\r$\n$\r$\nHer iki durumda da işlemden önce verilerinizin güvenlik kopyası Belgeler\Anatek Yedekleri klasörüne alınır." IDYES AnatekKeep IDNO AnatekAskClean
      Quit
    AnatekAskClean:
      MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "DİKKAT: Temiz kurulumda eski Anatek verileriniz (müşteriler, araçlar, servisler, ödemeler...) silinecektir.$\r$\n$\r$\nSilmeden önce güvenlik kopyası alınır; kopya alınamazsa hiçbir şey silinmez. Yine de önceden Anatek içinden Veri yedekleme > Yedek Oluştur yapmanız önerilir.$\r$\n$\r$\nTemiz kurulum yapılsın mı?" IDYES AnatekDoClean
      Quit
    AnatekDoClean:
      StrCpy $AnatekClean "1"
    AnatekKeep:
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  StrCpy $AnatekOK "1"
  StrCpy $AnatekBak "$DOCUMENTS\Anatek Yedekleri\son-guncelleme-oncesi"
  ${If} ${FileExists} "$APPDATA\Anatek\Local Storage\*.*"
  ${OrIf} ${FileExists} "$APPDATA\Anatek\IndexedDB\*.*"
  ${OrIf} ${FileExists} "$APPDATA\UstaServisTakip\Local Storage\*.*"
  ${OrIf} ${FileExists} "$APPDATA\UstaServisTakip\IndexedDB\*.*"
  ${OrIf} ${FileExists} "$APPDATA\usta-servis-takip\Local Storage\*.*"
  ${OrIf} ${FileExists} "$APPDATA\usta-servis-takip\IndexedDB\*.*"
    RMDir /r "$AnatekBak"
    CreateDirectory "$DOCUMENTS\Anatek Yedekleri"
    CreateDirectory "$AnatekBak"
    !insertmacro AnatekBackupDir "Anatek"
    !insertmacro AnatekBackupDir "UstaServisTakip"
    !insertmacro AnatekBackupDir "usta-servis-takip"
    ${If} $AnatekOK == "1"
      FileOpen $AnatekFh "$AnatekBak\Okubeni.txt" w
      FileWrite $AnatekFh "Anatek guvenlik kopyasi.$\r$\n"
      FileWrite $AnatekFh "Anatek guncellenmeden veya temiz kurulmadan hemen once otomatik alindi.$\r$\n$\r$\n"
      FileWrite $AnatekFh "Geri yuklemek icin: Anatek'i kapatin. Bu klasordeki Anatek klasorunun icindeki$\r$\n"
      FileWrite $AnatekFh "'Local Storage' ve 'IndexedDB' klasorlerini $APPDATA\Anatek icine kopyalayin$\r$\n"
      FileWrite $AnatekFh "(varolanlarin yerine). Daha kolayi: Anatek icinden Veri yedekleme sayfasini kullanin.$\r$\n"
      FileClose $AnatekFh
    ${EndIf}
  ${EndIf}
  ${If} $AnatekClean == "1"
    ${If} $AnatekOK == "1"
      RMDir /r "$APPDATA\Anatek"
      RMDir /r "$APPDATA\UstaServisTakip"
      RMDir /r "$APPDATA\usta-servis-takip"
    ${Else}
      MessageBox MB_OK|MB_ICONEXCLAMATION "Güvenlik kopyası alınamadığı için eski verileriniz SİLİNMEDİ. Anatek eski verilerinizle açılacaktır."
    ${EndIf}
  ${EndIf}
!macroend
