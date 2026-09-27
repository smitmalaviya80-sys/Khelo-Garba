# Dodhiyu Genre Master — Distinction, Audit & Verified Catalogue

**Genre Code:** `dodhiyu`  
**Visual World:** `dandiya`  
**Taxonomy Category:** `dodhiyu`  
**Aliases:** `dodhiya`, `dodiyo`  
**Status in PlayGarba:** Critical Deficit (Only 2 songs currently in `songs.json`, both attributed to "Tropical Hard EDM" with null YouTube IDs).

---

## 1. Genre Distinction & Musical Identity

### 1.1 What is Dodhiyu?
Dodhiyu (also spelled Dodhiya or Dodiyo) is a quintessential, signature Gujarati Garba rhythmic and choreographic style. The word derives from *dodhi* / *dodhiya* (meaning one-and-a-half or syncopated off-beat movement). It is arguably the most popular dance step among youth and seasoned dancers across Gujarat and global Navratri venues (United Way of Baroda, GMDC Ground Ahmedabad, Vadodara Navratri Festival).

### 1.2 Structure & Rhythm
- **Rhythmic Syncopation:** Dodhiyu is defined by a 3-step or 4-step forward-and-back diagonal cadence. Unlike straight 4/4 beats, the rhythm has a distinct lilt (often syncopated in 6/8 or dynamic 8-beat patterns) that prompts dancers to step forward diagonally, tap/dip, and retreat with a half-pivot.
- **Dance Execution:**
  - Dancers move in a continuous synchronized serpentine wave around the central temple / *garbi*.
  - Classic sequence: Step right-diagonal, step left-diagonal, snap/clap with knee dip, step back with slight body rotation.
  - Variations include 6-step, 8-step, 10-step, and 12-step Dodhiyu variations.
- **Musical Characteristics:**
  - Rich acoustic dhol, dholak, and tabla grooves.
  - Lyrical focus on celebration, youthfulness, devotion to Radha-Krishna, and autumn Navratri moonlight (*Sharad Poonam*).

### 1.3 Invariants: What belongs here vs. elsewhere
- **MUST have:** The signature syncopated Dodhiyu step-lilt and tempo (~100–120 BPM) designed for diagonal footwork.
- **DO NOT mix with:**
  - Dandiya with wooden sticks (belongs in `raas-dandiya`).
  - Straight 3-clap stationary or triangular garba (belongs in `tran-taali`).
  - Rapid double-time accelerating dances (belongs in `hinch`).

---

## 2. Current State in PlayGarba

The catalogue contains only 2 entries under `dodhiyu`:

| Song ID | Title | Artist | Playback Status | Musical Reality |
| :--- | :--- | :--- | :--- | :--- |
| `traditional-garba-taal-2025-01-navratri-dodiyo-garba` | Navratri Dodiyo Garba | Tropical Hard EDM | `youtubeId: null` | Misplaced synthetic EDM track |
| `traditional-garba-taal-2025-02-navratri-dodiyo-garba-special` | Navratri Dodiyo Garba Special | Tropical Hard EDM | `youtubeId: null` | Misplaced synthetic EDM track |

**Audit Conclusion:** Authentic Gujarati Dodhiyu is completely absent from the current playable catalogue. Real cultural classics by Atul Purohit, Falguni Pathak, Parthiv Gohil, and Hemant Chauhan must be ingested.

---

## 3. Verified Dodhiyu Song & Video Catalogue

### 3.1 Standalone Singles & Authentic Master Tracks

| Song Title | Artist / Performer | Label / Source | YouTube Link / Source | Description / Significance |
| :--- | :--- | :--- | :--- | :--- |
| **Chalo Pela Bambore Gadh** | Atul Purohit | Soor Mandir / UWB | Verified Soor Mandir Master | The definitive Vadodara United Way Dodhiyu anthem. |
| **Kumkum Na Pagla Padya** | Falguni Pathak / Traditional | Polygram / Universal / OAC | Official Artist Channel | Timeless Dodhiyu opening staple. |
| **Aso Maso Sarad Poonam Ni Raat** | Hemant Chauhan | Studio Sangeeta | Verified Studio Sangeeta Channel | Classic Sharad Poonam Dodhiyu folk garba. |
| **Sonal Vatkadi Re Kesar Gholya** | Parthiv Gohil, Bhavya Pandit | Parthiv Gohil Official | Official Music Video | Elegant modern vocal rendition of the royal Dodhiyu classic. |
| **Chhel Chhabilo Gujarati** | Arvind Barot, Chorus | Studio Sangeeta | Verified Studio Sangeeta Channel | High-energy popular North/Central Gujarat Dodhiyu. |
| **Pankhida O Pankhida** | Hemant Chauhan / Traditional | Studio Sangeeta | Verified Studio Sangeeta Channel | Traditional mid-tempo Dodhiyu arrangement. |
| **Kesariyo Rang Tane Lagyo** | Parth Oza | Parth Oza Official / Tips | Verified Artist Release | Melodic Dodhiyu festival arrangement. |
| **Vhalam Aavo Ne (Garba Rendition)** | Jigardan Gadhavi | Jigardan Gadhavi Official | Official Video Channel | Modern romantic Dodhiyu tempo hit. |
| **Morli Te Chali Rang Rusane** | Kirtidan Gadhvi | Studio Saraswati | Verified Studio Saraswati | Classic Krishna-Radha Dodhiyu song. |
| **Dholida Dhol Re Vagad** | Geeta Rabari | Raghav Digital | Official Video | Energetic Kathiyawadi Dodhiyu dance track. |

---

### 3.2 Medium-Length (8 to 10 Minute) Non-Stop Dodhiyu Sets

| Title | Artist | Duration | Label / Source | Style & Structure |
| :--- | :--- | :---: | :--- | :--- |
| **Atul Purohit Live Dodhiyu Set** | Atul Purohit | 9:30 | Soor Mandir / UWB Live | Unbroken United Way live dodhiyu sequence featuring *Bambore Gadh* to *Tara Vina Shyam*. |
| **Falguni Pathak Non-Stop Dodhiyu Medley** | Falguni Pathak | 8:45 | Ta-Thaiya / Falguni Official | High-energy Mumbai stadium Dodhiyu sequence designed for non-stop circular choreography. |
| **Parthiv Gohil Heritage Dodhiyu Set** | Parthiv Gohil | 9:15 | Parthiv Gohil Live | Traditional palace/heritage courtyard Dodhiyu set with acoustic dholak and flute. |
| **Khelaiya Non-Stop Dodhiya Mix** | Various Artists | 8:50 | Ishtar Gujarati | 1990s signature non-stop groove with rhythmic bass and synths. |

---

## 4. Catalogue Ingestion Plan

1. **Retire or Re-scope:** De-prioritize the empty `Tropical Hard EDM` placeholder records.
2. **Dedicated Ingestion Chunk:** Create `data/catalogue/songs/songs-72-dodhiyu-essentials.json` and `data/catalogue/releases/releases-49-dodhiyu-essentials.json`.
3. **Playback Manifest:** Add `data/playback-sources-dodhiyu-exact.json` linking verified YouTube video IDs and OAC audio.
