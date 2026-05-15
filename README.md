## Dosyalar
- `index.html` — Uygulama HTML iskeleti
- `app.js` — Uygulama mantığı ve OMDB çağrıları
- `style.css` — Stil dosyası
- `config.txt` — (eklenecek) OMDB API anahtarı: `API_KEY=...` veya sadece anahtar


## `config.txt` için
Projeye bir `config.txt` dosyası ekleyin. Desteklenen formatlar:

- `API_KEY=YOUR_OMDB_KEY`
- veya yalnızca `YOUR_OMDB_KEY` (tek satır)

Örnek:
API_KEY=ab123456


## Nasıl çalışır
- Sayfa yüklendiğinde `app.js` `config.txt` öğesini fetch ile alır ve `API_KEY` değişkenini ayarlar.
- `API_KEY` yüklendikten sonra arama butonu etkinleştirilir.
- Eğer `config.txt` yüklenemezse, arama yapılamaz ve kullanıcıya bilgi gösterilir.

## Sorun Giderme
- "config.txt yüklenemiyor" hatası: Projeyi bir HTTP sunucusunda çalıştırdığınızdan emin olun.
- Boş veya hatalı sonuçlar: `config.txt` içindeki anahtarın doğru ve OMDB kotasına sahip olduğundan emin olun.

