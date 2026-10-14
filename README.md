# Manga Lens

Okuduğun manga ya da çizgi roman sayfasını, bulunduğun yerde Türkçeye çeviren bir Chrome eklentisi. Sağdaki logoya (veya Alt+Shift+T) basınca ekran taranıyor, yazı alanları mavi ile işaretleniyor ve çeviriler hazır oldukça balonların içine tek tek yerleşiyor. Sayfa yenilenmiyor, sitenin kendisine dokunulmuyor.

## Nasıl çalışıyor

1. **Ekran görüntüsü:** Birçok resmi okuyucu sayfayı canvas'a çiziyor ya da resmi parçalara bölüyor, bu yüzden `<img>` aramak yerine `captureVisibleTab` ile görünen alan alınıyor. Her sitede aynı şekilde çalışıyor.
2. **Balon tespiti:** Görüntüde içinde koyu yazı olan kapalı beyaz alanlar aranıyor. Birbirine değen anlatım kutuları yazı bloklarına göre ayrılıyor, balonun yuvarlak mı köşeli mi olduğu da buradan çıkıyor.
3. **Çeviri:** Yazı alanları numaralı kutularla işaretlenip görüntüyle birlikte modele gönderiliyor. Cevap satır satır JSON olarak akıyor, her satır geldiğinde ilgili balon dolduruluyor.
4. **Yerleşim:** Metin balonun şekline göre diziliyor. Yuvarlak balonlarda üst ve alt satırlar daha kısa tutuluyor, sığan en büyük font boyutu seçiliyor, uzun kelimeler gerekirse Türkçe hece kurallarına göre bölünüyor (HOŞ-GELDİN gibi).
5. **Önbellek:** Çeviriler yazı alanının görüntüsüne göre saklanıyor. Aynı sayfaya dönünce tekrar istek atılmıyor.

**Otomatik mod** açıkken sonraki sayfaya geçilince ekran sessizce yeniden taranıyor. Webtoon gibi uzun sayfalarda kaydırma bitmesini beklemeden, ekrana giren yeni balonlar çevriliyor. Önceden çevrilen balonlar yerinde kalıyor.

## Diğer özellikler

- **Siyah balonlar:** Geri dönüş sahnelerindeki siyah zemin üstüne beyaz yazılar da bulunuyor, çeviri yine beyaz yazılıyor.
- **Seri sözlüğü:** Her seri için bir isim sözlüğü tutuluyor (`Akira-san = Akira Abi` gibi). Model yeni karakter isimlerini kendisi ekliyor, üst çubuktaki **Sözlük** düğmesinden düzeltilebiliyor. Önceki sayfanın son satırları da bağlam olarak gidiyor, böylece konuşmanın tonu sayfadan sayfaya kopmuyor.
- **Balon düğmeleri:** Çevrilmiş bir balonun üstüne gelince küçük düğmeler çıkıyor: yeniden çevir, elle düzelt, orijinali göster. Elle yapılan düzeltme önbelleğe yazılıyor, o balon bir daha geldiğinde düzeltilmiş hâli görünüyor.
- **Hitaplar:** -san, -kun, senpai gibi hitaplar olduğu gibi bırakılabiliyor ya da Türkçeleştirilebiliyor.
- **Maliyet:** Ayarlar sayfasında bu ay kaç istek atıldığı, kaç token harcandığı ve tahmini ücret görünüyor.
- **Logo:** Sağdaki logo sadece büyük görsel olan sayfalarda çıkıyor. Bir sitede istemiyorsan logonun köşesindeki × ile o sitede gizlenebiliyor.

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

- Beyaz ve siyah zeminli balonlar ve kutular bulunuyor. Doğrudan çizimin üstüne yazılmış metinler ve ses efektleri şimdilik çevrilmiyor.
- Seri, adresteki rakamsız kısımlardan tahmin ediliyor. Seriyi adreste numarayla tutan sitelerde sözlük site geneline yazılıyor.
- Çok küçük ya da düşük çözünürlüklü sayfalarda bazı balonlar kaçabiliyor.
- `chrome://` sayfaları ve Chrome Web Store taranamıyor.

## Lisans ve fontlar

Balon yazıları için [Comic Relief](https://fonts.google.com/specimen/Comic+Relief) (SIL Open Font License) kullanılıyor.
