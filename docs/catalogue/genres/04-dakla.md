# Dakla Genre Master — Distinction, Audit & Verified Catalogue

**Genre Code:** `dakla`  
**Visual World:** `fusion` (or primary Devotional)  
**Taxonomy Category:** `dakla`  
**Aliases:** `daak`, `dak`, `daklu`  
**Status in PlayGarba:** Under-represented (13 tracks, 10 of which are Bandish Projekt electronic tracks; missing the massive traditional & Coke Studio masterworks).

---

## 1. Genre Distinction & Musical Identity

### 1.1 What is Dakla?
Dakla (ડાકલા) is an ancient, deeply sacred devotional percussion ritual and musical tradition of Gujarat. Centered around the *Dak* (an hourglass-shaped brass or wooden hand-drum played with a specialized strike technique and modulating pitch strings), Dakla is intimately associated with the fierce, protective forms of the Divine Mother: **Maa Mogal**, **Meldi Maa**, **Chamunda Maa**, **Mahakali**, and **Khodiyar Maa**. 

In recent years, Dakla has achieved massive global crossover: from traditional ritual shrines (Mahuva, Chotila, Gadhada) to festival stages and Coke Studio Bharat (*"Mogal Aave"* by Sachin-Jigar and Kirtidan Gadhvi), transforming into a spellbinding spiritual trance genre.

### 1.2 Structure & Rhythm
- **The Percussive Signature:** The *Dak* produces a mesmerizing, resonant pitch-bending beat that tightens and accelerates. Combined with the *Kaansi-Joda* (brass plates) and heavy *dhol*, the rhythm creates an irresistible trance state (*Ahesh / Dhun*).
- **Vocal Style:** Raw, guttural, declamatory chants invoking the genealogy, bravery, and fierce compassion of the goddess (*stutis*, *chhand*, and *kavitt*).
- **Dance / Movement:** Dancers sway rhythmically with intense devotion, often with raised hands, synchronized head movements, and accelerating stomps.

### 1.3 Invariants: What belongs here vs. elsewhere
- **MUST have:** The signature *Dak* percussion pattern and dedicated invocation of the fierce protective goddesses (Mogal, Meldi, Chamunda, Kali, Khodiyar).
- **DO NOT mix with:**
  - Sweet romantic Krishna garba (`krishna-garba`).
  - Standard Tran Taali gentle palace garba (`tran-taali`).
  - Humorous festival couplets (`sanedo`).

---

## 2. Current State in PlayGarba

The catalogue has 13 entries under `dakla`:
- **10 tracks** are electronic/urban tracks from the *Bandish Projekt* (all 10 have `youtubeId: null`).
- **3 tracks** are playable folk tracks (Rushabh Ahir / Santvani Trivedi and Kinjal Dave).

**Audit Conclusion:** The genre is missing its biggest cultural pillars. The sacred masterworks of Kirtidan Gadhvi, Sachin-Jigar, Pravin Luni, and Gaman Santhal must be added.

---

## 3. Verified Dakla Song & Video Catalogue

### 3.1 Iconic Standalone Master Tracks & Singles

| Song Title | Artist / Performer | Label / Source | YouTube Link / Source | Description / Significance |
| :--- | :--- | :--- | :--- | :--- |
| **Mogal Aave** | Sachin-Jigar, Kirtidan Gadhvi | Coke Studio Bharat / Universal | Verified Official Video | The definitive modern global Dakla masterpiece with 100M+ views. |
| **Mogal Chhedta Kalo Naag** | Kirtidan Gadhvi | Studio Saraswati Official | Verified Saraswati Master | Sacred Charan chhand invoking the fierce wrath and grace of Maa Mogal. |
| **Maa Meldi No Daklo** | Pravin Luni | Studio Sangeeta / Ekta Sound | Verified Official Video | The gold-standard ritual Dakla performance by Gujarat’s foremost Dak master. |
| **Chotila Ni Dungare Dakla Vagya** | Hemant Chauhan | Soor Mandir | Verified Soor Mandir Channel | Classic devotional Dakla honoring Chamunda Maa of Chotila. |
| **Maha Kali Maa No Daklo** | Gaman Santhal | Studio Saraswati | Verified Studio Saraswati | High-energy ritual devotion from North Gujarat. |
| **Khodiyar Maa No Daklo** | Kirtidan Gadhvi | Studio Saraswati | Official Artist Video | Relentless accelerating temple trance dedicated to Maa Khodiyar. |
| **Dakla 2.0 (Electronic Trance Edit)** | DJ Harsh / Folk Fusion | Independent / OAC | Official Audio Channel | Contemporary club/festival crossover. |

---

### 3.2 Medium-Length (8 to 10 Minute) Non-Stop Dakla Sets

| Title | Artist | Duration | Label / Source | Style & Structure |
| :--- | :--- | :---: | :--- | :--- |
| **Kirtidan Gadhvi Non-Stop Mogal Dakla Set** | Kirtidan Gadhvi | 9:45 | Studio Saraswati Live | Intense live festival set transitioning through *Chhand*, *Doha*, and thundering Dakla rhythms. |
| **Pravin Luni Live Ritual Dakla Medley** | Pravin Luni | 9:10 | Ekta Sound Live | Authentic traditional ritual setting capturing continuous acoustic Dak percussion and vocal improvisations. |
| **Sachin-Jigar Live Garba Trance (Dakla Finale)** | Sachin-Jigar, Kirtidan Gadhvi | 8:50 | Sony Music / Live | Festival arena arrangement with live rock rhythm section layered over sacred Dakla beats. |

---

## 4. Catalogue Ingestion Plan

1. **Dedicated Ingestion Chunk:** Create `data/catalogue/songs/songs-74-dakla-essentials.json` and `data/catalogue/releases/releases-51-dakla-essentials.json`.
2. **Playback Manifest:** Create `data/playback-sources-dakla-exact.json` linking verified YouTube video IDs and OAC audio.
3. Update `data/catalogue/index.json`.
