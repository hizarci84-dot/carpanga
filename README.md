# Çarpanga Web — Pardus Akıllı Tahta & Okul Turnuva Sürümü

**Çarpanga**, çarpma işlemini temel alan 2 kişilik (veya 4 zorluk seviyeli yapay zekaya karşı) zeka ve strateji oyunudur. Orijinal Unity sürümünden esinlenerek **Pardus yüklü akıllı tahtalarda** tarayıcı üzerinden kurulumsuz, tam ekran ve dokunmatik uyumlu çalışacak şekilde web uygulamasına dönüştürülmüştür.

## Özellikler

- **4 Oyun Modu:**
  - **Düello (2 Öğrenci):** Aynı akıllı tahta üzerinde iki öğrenci sırayla hamle yapar.
  - **Bilgisayara Karşı:** Basit, Orta, Zor ve Uzman (4 seviye) yapay zekaya karşı oynanır.
  - **Meydan Okuma (30 sn Süreli):** Her hamle için 30 saniye geri sayımlı mod.
  - **Nasıl Oynanır?:** 18 adımlı etkileşimli görsel oyun öğreticisi.
- **Akıllı Tahta (Pardus ETAP) Dostu Arayüz:**
  - 16:9 yatay tahtalara tam oturan büyük dokunmatik rakam ve tahta butonları.
  - Fiziksel klavye bulunmayan tahtalar için dahili **Türkçe Dokunmatik Klavye**.
  - Tam ekran (`⛶`) butonu ve orijinal ses efektleri (ses aç/kapa destekli).
- **Öğrenci Skor Tablosu & Merkezi Bulut Veritabanı (Firebase Firestore):**
  - Oynayan öğrenciler sınıf/şube ve ad-soyad girerek maçları kaydeder.
  - **Öğrenci Sıralaması** (Maç, Kazandı, Kaybetti, Berabere, Başarı %, Puan) ve **Maç Geçmişi** (Kim kazandı / kim kaybetti).
  - Sınıf ve moda göre filtreleme + **Excel / LibreOffice Calc (UTF-8 CSV) dışa aktarma**.
  - Çevrimdışı çalışma desteği: İnternet kesikse yerel depolamaya kaydedilir, bağlantı geldiğinde otomatik senkronize edilir.

---

## 1. GitHub Web Sitesi (GitHub Pages) Olarak Yayınlama

Projede derleme (build) adımı yoktur; doğrudan statik HTML/CSS/JS olarak çalışır.

1. GitHub'da yeni bir repository oluşturun (ör. `carpanga-oyunu`).
2. Bu klasördeki dosyaları repository'ye yükleyin:
   ```bash
   git init
   git add .
   git commit -m "Carpanga web ve ogrenci veritabani surumu"
   git branch -M main
   git remote add origin https://github.com/<KULLANICI_ADINIZ>/carpanga-oyunu.git
   git push -u origin main
   ```
3. GitHub'da repository sayfasından **Settings → Pages** bölümüne gidin:
   - **Source** olarak **GitHub Actions** seçin (hazır `.github/workflows/deploy.yml` dosyasını otomatik kullanır) **veya** **Deploy from a branch** → `main` / `/ (root)` seçin.
4. Birkaç dakika içinde siteniz `https://<KULLANICI_ADINIZ>.github.io/carpanga-oyunu/` adresinde yayına alınacaktır.

---

## 2. Firebase Firestore Kurulumu (Hazır Yapılandırıldı)

Proje için merkezi Firestore veritabanı (`carpanga-okul-8426`) otomatik oluşturulup [js/firebase-config.js](js/firebase-config.js) ve [firestore.rules](firestore.rules) dosyalarıyla projeye bağlanmıştır. GitHub Pages'e yüklediğinizde tüm Pardus akıllı tahtalar ek ayar gerektirmeden doğrudan bu ortak bulut veritabanına bağlanır.

Farklı bir Firebase projesi kullanmak isterseniz:
1. `firebase login` ardından `firebase deploy --only firestore` ile yeni projenize [firestore.rules](firestore.rules) ve [firestore.indexes.json](firestore.indexes.json) dosyalarını yayınlayabilirsiniz.
2. Veya site içindeki **Öğretmen / Veritabanı** ekranından yeni `firebaseConfig` bilgisini yapıştırıp **Diğer Tahtalar İçin Kurulum Linki Kopyala** butonunu kullanabilirsiniz.

---

## Yerel Test Etme

```bash
# Birim testleri (Node.js)
node tests/game-engine.test.js

# Yerel web sunucusu ile tarayıcıda açma
python3 -m http.server 8080
# Tarayıcıda: http://localhost:8080
```
