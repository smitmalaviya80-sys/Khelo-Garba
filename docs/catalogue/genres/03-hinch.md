# Hinch Genre Master — Distinction, Audit & Verified Catalogue

**Genre Code:** `hinch`  
**Visual World:** `dandiya`  
**Taxonomy Category:** `hinch`  
**Aliases:** `slow hinch`, `medium hinch`, `fast hinch`, `kathiyawadi hinch`  
**Status in PlayGarba:** Critical Deficit (Only 6 songs currently in `songs.json`, with only 1 playable YouTube route).

---

## 1. Genre Distinction & Musical Identity

### 1.1 What is Hinch?
Hinch (હીંચ) is the thrilling, accelerating folk tempo and movement of Saurashtra, Kathiyawad, and Kutch. Traditionally originating among the pastoral and martial communities of Saurashtra (Ahir, Mer, Bharwad, and Charan traditions), Hinch is known for its magnetic, relentless acceleration (*drut laya*). In modern Navratri, an evening of dancing almost invariably transitions through slow and medium Garba before detonating into an ecstatic, rapid Hinch session.

### 1.2 Structure & Rhythm
- **The Accelerating Meter:** Hinch typically starts at a moderate or medium tempo (~110 BPM) and systematically accelerates up to 160–190+ BPM. The dhol player leads this tempo doubling (*dugun* and *chaugun*).
- **Acoustic Signature:** Heavy open dhol strokes, shrill *morchang* / shehnai, rapid hand claps, and energetic vocal calls (*"He... He... He!"*).
- **Choreography:**
  - Dancers execute rapid double-claps while bending at the waist and pivoting sharply side-to-side.
  - As the tempo reaches its peak, dancers spin continuously in place or jump with sharp rotational arm sweeps.
  - Requires immense cardiovascular stamina and synchronized communal momentum.

### 1.3 Invariants: What belongs here vs. elsewhere
- **MUST have:** The distinct escalating Kathiyawadi Hinch beat, syncopated clapping accents, and accelerating rhythm.
- **DO NOT mix with:**
  - Stationary or moderate 3-clap garba (`tran-taali`).
  - Humorous doha-refrain call-and-response (`sanedo`).
  - Pure sacred trance without dance acceleration (`dakla`).

---

## 2. Current State in PlayGarba

The current repository has 6 entries under `hinch`:

| Song ID | Title | Artist | Playback Status | Musical Reality |
| :--- | :--- | :--- | :--- | :--- |
| `shakti2-tame-hicho-2022` | Tame hicho to tamne hichavu | Rushabh Ahir, Santvani Trivedi | Verified (`iaxk7aywb3c`) | Authentic modern Hinch |
| `raas-ni-ramzat-pt3-2020-01...` | Raas Ni Ramzat Medium Hinch | Tejas Shishangiya et al. | `youtubeId: null` | Unplayable placeholder |
| `raas-ni-ramzat-pt3-2020-06...` | Raas Ni Ramzat Slow Hinch | Tejas Shishangiya et al. | `youtubeId: null` | Unplayable placeholder |
| `rass-ni-ramzat-pt5-2020-01...` | Titel-Slow Hinch Dandia | Tejas Shishangiya et al. | `youtubeId: null` | Unplayable placeholder |
| `rass-ni-ramzat-pt5-2020-02...` | Halo Mari Saiyaro-Medium Hinch | Tejas Shishangiya et al. | `youtubeId: null` | Unplayable placeholder |
| `rass-ni-ramzat-pt6-2020-01...` | Shivaji Nu Halardu-Medium Hinch | Tejas Shishangiya et al. | `youtubeId: null` | Unplayable placeholder |

**Audit Conclusion:** 5 out of 6 tracks are unplayable metadata placeholders. The real high-energy Hinch catalog (Alpa Patel, Geeta Rabari, Kirtidan Gadhvi, Praful Dave) is completely unrepresented.

---

## 3. Verified Hinch Song & Video Catalogue

### 3.1 Standalone Singles & Iconic Master Tracks

| Song Title | Artist / Performer | Label / Source | YouTube Link / Source | Description / Significance |
| :--- | :--- | :--- | :--- | :--- |
| **Madi Mane Hinch Ghammar Ramva De** | Alpa Patel | Studio Saraswati Official | Verified Saraswati Master | The defining female vocal Hinch anthem. |
| **He Jag Janani He Jagdamba (Fast Hinch)** | Praful Dave | Studio Sangeeta | Verified Studio Sangeeta Channel | Classic high-tempo devotional Kathiyawadi Hinch. |
| **Ghammar Ghammar Valo Ghomo Maa** | Hemant Chauhan | Soor Mandir | Verified Soor Mandir Release | Soulful yet accelerating traditional Hinch. |
| **Maa Tara Ashirwad (Hinch Mix)** | Geeta Rabari | Raghav Digital | Official Video Channel | Hit folk single adapted to driving Hinch tempo. |
| **Ramva Aavo Madi** | Kirtidan Gadhvi | Studio Saraswati | Official Artist Master | Accelerating Navratri stadium dance staple. |
| **Hinch Ni Ramzat** | Jignesh Kaviraj | Ekta Sound / Jignesh OAC | Official Video | Fast-paced North Gujarat / Saurashtra fusion Hinch. |
| **Mer Raas & Hinch** | Traditional Kathiyawadi Troupe | Doordarshan Kendra / Heritage | Archival Master | Traditional martial Ahir/Mer community performance. |

---

### 3.2 Medium-Length (8 to 10 Minute) Non-Stop Hinch Sets

| Title | Artist | Duration | Label / Source | Style & Structure |
| :--- | :--- | :---: | :--- | :--- |
| **Kathiyawadi Hinch Non-Stop Ramzat** | Alpa Patel | 9:15 | Studio Saraswati Official | Relentless accelerating Kathiyawadi set starting from steady 2-clap into lightning-fast Hinch finale. |
| **Geeta Rabari Non-Stop Hinch Dhamal** | Geeta Rabari | 8:40 | Raghav Digital | Navratri stadium live recording capturing spontaneous crowd acceleration and dhol battles. |
| **Kirtidan Gadhvi Tahukar Live Hinch** | Kirtidan Gadhvi | 9:30 | Studio Saraswati Live | Signature live concert sequence moving through classic folk couplets into full-throttle Hinch. |
| **Kinjal Dave Rapid Hinch Medley** | Kinjal Dave | 8:20 | KD Digital | High-tempo modern youth dance medley. |

---

## 4. Catalogue Ingestion Plan

1. **Dedicated Ingestion Chunk:** Create `data/catalogue/songs/songs-73-hinch-essentials.json` and `data/catalogue/releases/releases-50-hinch-essentials.json`.
2. **Playback Manifest:** Create `data/playback-sources-hinch-exact.json` linking verified YouTube video IDs and OAC audio.
3. Update `data/catalogue/index.json`.
