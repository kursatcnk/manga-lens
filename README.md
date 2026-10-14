# Manga Lens

Okuduğun manga ya da çizgi roman sayfasını, bulunduğun yerde Türkçeye çeviren bir Chrome eklentisi. Sağdaki logoya (veya Alt+Shift+T) basınca ekran taranıyor, yazı alanları mavi ile işaretleniyor ve çeviriler hazır oldukça balonların içine tek tek yerleşiyor. Sayfa yenilenmiyor, sitenin kendisine dokunulmuyor.

## Nasıl çalışıyor

1. **Ekran görüntüsü:** Birçok resmi okuyucu sayfayı canvas'a çiziyor ya da resmi parçalara bölüyor, bu yüzden `<img>` aramak yerine `captureVisibleTab` ile görünen alan alınıyor. Her sitede aynı şekilde çalışıyor.
2. **Balon tespiti:** Görüntüde içinde koyu yazı olan kapalı beyaz alanlar aranıyor. Birbirine değen anlatım kutuları yazı bloklarına göre ayrılıyor, balonun yuvarlak mı köşeli mi olduğu da buradan çıkıyor.
3. **Çeviri:** Yazı alanları numaralı kutularla işaretlenip görüntüyle birlikte modele gönderiliyor. Cevap satır satır JSON olarak akıyor, her satır geldiğinde ilgili balon dolduruluyor.
4. **Yerleşim:** Metin balonun şekline göre diziliyor. Yuvarlak balonlarda üst ve alt satırlar daha kısa tutuluyor, sığan en büyük font boyutu seçiliyor, uzun kelimeler gerekirse Türkçe hece kurallarına göre bölünüyor (HOŞ-GELDİN gibi).
5. **Önbellek:** Çeviriler yazı alanının görüntüsüne göre saklanıyor. Aynı sayfaya dönünce tekrar istek atılmıyor.

**Otomatik mod** açıkken sayfa kaydırılınca veya sonraki sayfaya geçilince ekran sessizce yeniden taranıyor. Önceden çevrilen balonlar yerinde kalıyor, sadece yeni balonlar çevriliyor.

## Kurulum

```bash
npm install
npm run build
```

Chrome'da `chrome://extensions` sayfasını aç, sağ üstten **Geliştirici modu**nu aç, **Paketlenmemiş öğe yükle** ile `dist` klasörünü seç. İlk kurulumda ayarlar sayfası açılıyor; orada Claude ya da Gemini API anahtarını gir.

Anahtar sadece tarayıcının yerel deposunda tutuluyor ve sadece seçilen servisin API'sine gönderiliyor. Her taramada çevrilmemiş balonlar için tek bir istek atılıyor, ücreti kendi anahtarına yansıyor.

## Geliştirme

```bash
npm run dev        # eklentiyi izleyerek derler + test sayfasını açar (localhost:5317)
npm test
npm run typecheck
```

Test sayfası (`dev/`) eklenti API'lerini taklit ediyor: ekran görüntüsü yerine sayfadaki görseli çiziyor, çeviri yerine örnek cümleler dönüyor. Böylece tespit ve yerleşim API anahtarı olmadan denenebiliyor. `dev/pages` klasörüne kendi test sayfalarını koyman gerekiyor, bu klasör repoya eklenmiyor.

## Sınırlar

- Sadece beyaz (veya beyaza yakın) zeminli balonlar ve kutular bulunuyor. Doğrudan çizimin üstüne yazılmış metinler ve ses efektleri şimdilik çevrilmiyor.
- Çok küçük ya da düşük çözünürlüklü sayfalarda bazı balonlar kaçabiliyor.
- `chrome://` sayfaları ve Chrome Web Store taranamıyor.

## Lisans ve fontlar

Balon yazıları için [Comic Relief](https://fonts.google.com/specimen/Comic+Relief) (SIL Open Font License) kullanılıyor.
