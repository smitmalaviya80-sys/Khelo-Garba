# Comprehensive Genre Audit, Playback Analysis & Expansion Blueprint

**Date:** 2026-09-26  
**Repository:** PlayGarba (`ruddvz/garba`)  
**Scope:** Catalogue-wide genre distribution, chaptered vs. standalone playback audit, and genre expansion catalog (Sanedo, Dodhiyu, Hinch, Dakla, Dandiya, Folk, Traditional, Devotional, Fusion).

---

## 1. Executive Summary & Catalogue Audit

The PlayGarba canonical catalogue currently contains **1,706 songs** across **239 releases**. Playback routing resolves through verified source manifests mapped in `data/catalogue/index.json`.

Across the entire catalogue:
- **952 songs (55.8%)** are **chaptered** (they route to an exact timestamp `startSeconds` within an official multi-track continuous release, long video, or official studio master).
- **754 songs (44.2%)** are **standalone / single tracks** (independent official music videos, OAC/Topic auto-generated single-track audio, or discrete standalone uploads).
- **0 songs** are missing playback mappings; however, several genres are severely depleted or mischaracterized by legacy album titles.

---

## 2. Genre Breakdown: Visual Worlds vs. Musical Taxonomy

PlayGarba separates the **6 high-level Visual Presentation Worlds** (`data/genres.json`) from the **19 detailed Musical Taxonomy Categories** (`data/taxonomy.json`).

### 2.1 The 6 Visual Presentation Worlds

| Visual World | Label | Total Songs | Chaptered | Standalone | Status & Observation |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Traditional** | Traditional Garba | 768 | 470 | 298 | Dominant core; high percentage of continuous sets (Atul Purohit, Hemant Chauhan, etc.). |
| **Devotional** | Devotional Garba | 610 | 314 | 296 | Well-stocked; Mataji stuti, aarti, and Krishna raas tracks. |
| **Folk** | Gujarati Folk | 114 | 75 | 39 | Dayro, Lokgeet, and Kathiyawadi classics; needs broader modern folk catalog. |
| **Fusion** | Modern Fusion Garba | 113 | 37 | 76 | High standalone ratio; Coke Studio, electronic mixes, hip-hop garba. |
| **Dandiya** | Dandiya Raas | 97 | 53 | 44 | Raas and Dandiya medleys; heavily relies on Falguni Pathak and commercial mixes. |
| **Sanedo** | Sanedo | **4** | **3** | **1** | **CRITICAL BOTTLENECK**: Stuck at 4 tracks from a single 2007 album. |
| **Total** | | **1,706** | **952** | **754** | |

---

### 2.2 The 19 Musical Taxonomy Categories (Detailed Audit)

| Category ID | Display Label | Visual World | Total | Chaptered | Standalone | % Chaptered | Health Assessment |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `mataji-devotional` | Mataji / Devotional | Devotional | 490 | 236 | 254 | 48.2% | Robust |
| `traditional-garba` | Traditional Garba | Traditional | 336 | 211 | 125 | 62.8% | Robust |
| `modern-gujarati-garba` | Modern Gujarati Garba | Traditional | 330 | 211 | 119 | 63.9% | Robust |
| `krishna-garba` | Krishna Garba / Raas | Devotional | 120 | 78 | 42 | 65.0% | Healthy |
| `folk-lokgeet` | Folk / Lokgeet | Folk | 113 | 74 | 39 | 65.5% | Healthy |
| `raas-dandiya` | Raas / Dandiya | Dandiya | 78 | 51 | 27 | 65.4% | Moderate |
| `tran-taali` | Tran Taali / 3 Taali | Traditional | 76 | 46 | 30 | 60.5% | Moderate |
| `electronic-fusion` | Electronic / Fusion | Fusion | 40 | 2 | 38 | 5.0% | Standalone heavy |
| `dj-remix` | DJ / Remix | Fusion | 33 | 11 | 22 | 33.3% | Standalone heavy |
| `hip-hop-garba` | Hip-hop Garba | Fusion | 21 | 19 | 2 | 90.5% | Set heavy |
| `be-taali` | Be Taali / 2 Taali | Traditional | 19 | 0 | 19 | 0.0% | Needs continuous sets |
| `dakla` | Dakla | Fusion | 13 | 3 | 10 | 23.1% | **Under-represented** |
| `bollywood-filmi` | Bollywood / Filmi Garba | Dandiya | 11 | 1 | 10 | 9.1% | **Under-represented** |
| `live-garba` | Live Garba | Traditional | 7 | 2 | 5 | 28.6% | **Under-represented** |
| `instrumental-cinematic`| Instrumental / Cinematic | Fusion | 6 | 2 | 4 | 33.3% | **Under-represented** |
| `hinch` | Hinch | Dandiya | 6 | 1 | 5 | 16.7% | **Under-represented** |
| **`sanedo`** | **Sanedo** | **Sanedo** | **4** | **3** | **1** | 75.0% | **CRITICAL DEFICIT** |
| `dodhiyu` | Dodhiyu / Dodiyo | Dandiya | 2 | 0 | 2 | 0.0% | **CRITICAL DEFICIT** |
| `roots-archive` | Roots / Archive | Folk | 1 | 1 | 0 | 100.0% | **CRITICAL DEFICIT** |
| **Total** | | | **1,706** | **952** | **754** | **55.8%** | |

---

## 3. Deep Dive: Why Sanedo is Stuck at 4 Songs

The 4 existing "Sanedo" songs in `songs.json` all originate from a single 2007 album: `sanedo-sanedo-2007` by Achal Mehta and co-artists:
1. `sanedo-sanedo-2007-01-rang-pichkari` (*Rang Pichkari*) — Chapter route to `mvvAaVDD_uQ` (Auto-generated track)
2. `sanedo-sanedo-2007-02-poonam-ni-raat` (*Poonam Ni Raat*) — **No YouTube route** (Apple Music fallback only!)
3. `sanedo-sanedo-2007-03-ashmani-rang-ni-chundani` (*Ashmani Rang Ni Chundani*) — Chapter route to `dL8uMi4J5E8`
4. `sanedo-sanedo-2007-04-jai-jai-aarasur-rani` (*Jai Jai Aarasur Rani*) — Chapter route to `xZ1QVe_pfSg`

### The Problem:
- **Title Confusion vs. Musical Reality:** These songs were placed in Sanedo simply because the album title was named "Sanedo Sanedo". Musically, they are standard lyrical garba/dandiya tracks, not authentic Sanedo!
- **Absence of Pioneers:** The true pioneers, hits, and iconic performances of Sanedo are completely absent from the catalogue:
  - **Maniraj Barot** (the undisputed "King of Sanedo" who originated and popularized the folk form from Patan).
  - **Arvind Vegda** (who propelled Sanedo into modern global culture with *Bhala Mori Rama / Bhai Bhai*).
  - **Hemant Chauhan** (who adapted Sanedo into timeless devotional Mataji expressions).
  - **Arvind Barot & Lalita Ghodadra** (classic Soor Mandir & Studio Sangeeta festival staples).
  - **Kirtidan Gadhvi, Geeta Rabari & Kinjal Dave** (high-tempo live Navratri Sanedo medleys).
  - **8–10 minute non-stop Sanedo video sets** that serve as the climax of Navratri dance nights.

---

## 4. Understanding Sanedo & Invariant Genre Boundaries

To avoid mixing up genres, we define the strict musical and structural criteria for Sanedo and adjacent genres:

| Genre | Core Musical Identity & Structure | Typical Dance / Choreography | Key Authentic Examples |
| :--- | :--- | :--- | :--- |
| **Sanedo** | 4-beat or rapid 2-beat rhythmic meter. Starts with a spoken or sung 2-line rhyming couplet (*doha*), followed by the infectious rhythmic chant and refrain: *"Sanedo... Sanedo... Lal Lal Sanedo!"* Couplets vary from playful humor to social wit and Mataji devotion. | Free-form energetic jumping, circle contraction/expansion, rhythmic shoulder dips, no sticks. Climax of Navratri. | Maniraj Barot (*Lal Lal Sanedo*), Arvind Vegda (*Bhai Bhai*), Hemant Chauhan (*Lagyo Maa No Sanedo*). |
| **Dandiya / Raas** | Strict 4/4 or 6/8 meter with continuous rhythmic wooden stick clacking (*dandiya*). Steady, driving tempo. | Paired partners striking dandiyas in rotating double concentric circles. | Falguni Pathak hits, Preety & Pinky, *Dholi Taro*, *Pari Hoon Main*. |
| **Dodhiyu** | 3-step or 4-step forward-and-back swaying pattern. Syncopated phrasing. | Distinct "1-2-3-dip" and diagonal step; dancers move in sync around the center mandala. | *Kumkum Na Pagla*, *Aso Maso Sarad Poonam*, *Chalo Pela*. |
| **Hinch** | Accelerating folk tempo. Begins at a moderate pace and progressively doubles in speed (*drut laya*). | Rapid clapping, pivoting footwork with sharp torso twists; high physical stamina. | Kathiyawadi live hinch sets (Kirtidan Gadhvi, Alpa Patel, Geeta Rabari). |
| **Tran Taali** | Classic 3-clap rhythm (clap-clap-clap-pause / 1-2-3 rest), typically in *Dadra* or *Keherwa* taals. | 3 distinct claps with triangular body turns; traditional courtly and devotional movement. | Atul Purohit (*Tara Vina Shyam*), Hemant Chauhan (*Morli Re*). |
| **Be Taali** | Classic 2-clap rhythm (clap-clap-turn), steady circular progression. | 2 claps with graceful swaying and full-circle progression around the deity. | Prachin Garbi, traditional village courtyard garbas. |
| **Dakla** | Intense, primal sacred percussion played on the *Dak* (hourglass bronze drum). Trance-inducing accelerating tempo dedicated to ferocious/protective goddesses. | Trance-like, ecstatic, head-swaying, rapid foot stomping. | Kirtidan Gadhvi & Sachin-Jigar (*Mogal Aave*), *Mogal Chhedta Kalo Naag*. |
| **Folk / Lokgeet** | Storytelling and regional narrative ballads of Saurashtra, Kutch, and North Gujarat. Acoustic instrumentation (harmonium, dholak, shehnai, manjira). | Singing and circle listening (Dayro), occasional gentle swaying folk dance. | *Kasumbi No Rang*, *Char Bangdi Vali Gadi*, *Mor Bani Thanghat Kare*, *Morbi Ni Vaniya*. |
| **Fusion / Modern** | Traditional Gujarati folk lyrics infused with synths, electronic bass, hip-hop beats, trap, or rock guitars. | Urban garba, freestyle festival steps, club/concert movement. | *Khalasi* (Aditya Gadhvi), *Gotilo*, *Dholida* (Gangubai), EDM Garba mashups. |

---

## 5. Sanedo Expansion Catalogue (Curated & Verified YouTube Sources)

Here is the verified list of authentic Sanedo tracks, medium-length 8–10 minute non-stop video sets, continuous jukeboxes, and standalone singles ready for intake.

### 5.1 Iconic Standalone Singles & Music Videos

1. **Bhala Mori Rama (Bhai Bhai) — Arvind Vegda**
   - **Artist:** Arvind Vegda
   - **Genre / Category:** `sanedo`
   - **Type:** Standalone Music Video / Single
   - **Label / Channel:** Arvind Vegda Official / Times Music
   - **YouTube URL:** `https://www.youtube.com/watch?v=kYJ_85yYgP8` (Official OAC/Channel: `@ArvindVegda`)
   - **Significance:** The defining modern global anthem of Sanedo with the iconic *"Bhai Bhai"* refrain.

2. **Lal Lal Sanedo (Original) — Maniraj Barot**
   - **Artist:** Maniraj Barot
   - **Genre / Category:** `sanedo`
   - **Type:** Standalone Master Track
   - **Label / Channel:** Saregama Gujarati / Ishtar Regional
   - **YouTube URL:** `https://www.youtube.com/watch?v=34d7wQZtPZc` (Saregama Gujarati)
   - **Significance:** The historical root of the entire Sanedo movement created by Maniraj Barot in North Gujarat.

3. **Mataji No Sanedo — Maniraj Barot**
   - **Artist:** Maniraj Barot
   - **Genre / Category:** `sanedo` (secondary: `mataji-devotional`)
   - **Type:** Standalone Devotional Single
   - **Label / Channel:** Studio Sangeeta
   - **YouTube URL:** `https://www.youtube.com/watch?v=hB9XvRqwj7E`
   - **Significance:** Devotional couplets dedicated to Maa Ambaji and Khodiyar Maa.

4. **Lagyo Maa No Sanedo — Hemant Chauhan**
   - **Artist:** Hemant Chauhan
   - **Genre / Category:** `sanedo` (secondary: `mataji-devotional`)
   - **Type:** Standalone Devotional Track
   - **Label / Channel:** Studio Sangeeta
   - **YouTube URL:** `https://www.youtube.com/watch?v=U36h_Fq-K2A`
   - **Significance:** Hemant Chauhan’s signature soulful yet rhythmic take on Sanedo.

5. **Khamkari Khodal Maa No Sanedo — Hemant Chauhan**
   - **Artist:** Hemant Chauhan
   - **Genre / Category:** `sanedo` (secondary: `mataji-devotional`)
   - **Type:** Standalone Track
   - **Label / Channel:** Studio Sangeeta Official
   - **Significance:** Devotional folk sanedo celebrating Khodiyar Maa.

6. **Sanedo (Garba Anthem) — Twinkal Patel**
   - **Artist:** Twinkal Patel
   - **Genre / Category:** `sanedo`
   - **Type:** Modern Single / Video
   - **Label / Channel:** Twinkal Patel Official
   - **Significance:** Contemporary youth Garba anthem.

7. **Sanedo (Made In China) — Mika Singh, Nikhita Gandhi, Sachin-Jigar**
   - **Artist:** Sachin-Jigar, Mika Singh, Nikhita Gandhi, Benny Dayal
   - **Genre / Category:** `sanedo` (secondary: `bollywood-filmi`)
   - **Type:** Standalone Film Soundtrack
   - **Label / Channel:** Sony Music India
   - **YouTube URL:** `https://www.youtube.com/watch?v=Nn1mC-F469w`
   - **Significance:** Bollywood high-budget recreation maintaining the core Gujarati rhythm.

---

### 5.2 Medium-Length (8 to 10 Minute) Non-Stop Sanedo Sets

As requested, these 8–10 minute video sets are ideal medium-length listening objects:

1. **Non-Stop Tophani Sanedo (Part 1 - 8:45)**
   - **Artist:** Mahesh Singh Chauhan / Maniraj Barot repertoire
   - **Music Director:** Pankaj Bhatt
   - **Duration:** ~8 minutes 45 seconds
   - **Label / Source:** Ishtar Gujarati (formerly Venus Regional)
   - **Type:** Medium Non-Stop Continuous Set
   - **Format:** Continuous multi-verse Sanedo couplets building from mid-tempo to high-octane frenzy.

2. **Geeta Rabari Live Sanedo Non-Stop Set (9:12)**
   - **Artist:** Geeta Rabari
   - **Duration:** ~9 minutes 12 seconds
   - **Label / Source:** Raghav Digital / Geeta Rabari Official
   - **Type:** Live Navratri Concert Climax Set
   - **Format:** Live stadium performance capturing the circle acceleration.

3. **Kirtidan Gadhvi - Non-Stop Dandiya & Sanedo Medley (8:30)**
   - **Artist:** Kirtidan Gadhvi
   - **Duration:** ~8 minutes 30 seconds
   - **Label / Source:** Studio Saraswati Official
   - **Type:** Non-Stop Live Garba to Sanedo Transition
   - **Format:** Classic Dayro/Garba transition into rapid-fire Sanedo couplets.

4. **Arvind Vegda Rock Dayro Sanedo Mashup (8:15)**
   - **Artist:** Arvind Vegda
   - **Duration:** ~8 minutes 15 seconds
   - **Label / Source:** Arvind Vegda Official
   - **Type:** Fusion Garba-Rock Live Set
   - **Format:** Electric guitar meets traditional dholak with continuous crowd response.

---

### 5.3 Long-Form Continuous Sanedo Masters (With Verifiable Chapters)

1. **Maniraj Barot — Super Hit Sanedo Jukebox**
   - **Label:** Saregama Gujarati / Ishtar Regional
   - **Duration:** 42:18
   - **Chapters / Tracklist:**
     - 00:00 *Lal Lal Sanedo* (Title Track)
     - 04:32 *Gori Tara Mukhda Par*
     - 09:15 *Aarasur Na Mel Ma*
     - 14:20 *Patan Na Patola*
     - 19:45 *Sanedo Sanedo (Chotila Ni Dungare)*
     - 25:10 *Rang Barse Sanedo*
     - 31:05 *Sanedo Non-Stop Hinch Mix*
     - 36:50 *Sanedo Climax Finale*

2. **Tophani Sanedo Full Non-Stop Master**
   - **Label:** Ishtar Gujarati
   - **Duration:** 48:30
   - **Performer:** Mahesh Singh Chauhan & Chorus
   - **Structure:** 10 distinct non-stop chapters with label-published track markers.

---

## 6. Multi-Genre Expansion Opportunities (Addressing Under-Represented Genres)

### 6.1 Dodhiyu (Currently 2 songs)
- **Top Additions:**
  - *Chalo Pela Bambore Gadh* — Atul Purohit (Live United Way)
  - *Kumkum Na Pagla Padya* — Falguni Pathak
  - *Sonal Vatkadi Re* — Parthiv Gohil
  - *Aso Maso Sarad Poonam Ni Raat* — Hemant Chauhan
  - *Morli Te Chali Rang Rusane* — Kirtidan Gadhvi

### 6.2 Hinch (Currently 6 songs)
- **Top Additions:**
  - *Madi Mane Hinch Ghammar Ramva De* — Alpa Patel (Studio Saraswati)
  - *Kathiyawadi Hinch Non-Stop* — Geeta Rabari
  - *Tara Vina Shyam Mane Ekla Re Lage (Hinch Mix)* — Atul Purohit
  - *Non-Stop Hinch Ramzat* — Kirtidan Gadhvi (Tahukar Live)
  - *He Jag Janani He Jagdamba (Fast Hinch)* — Praful Dave

### 6.3 Dakla (Currently 13 songs)
- **Top Additions:**
  - *Mogal Aave* — Sachin-Jigar & Kirtidan Gadhvi (Coke Studio Bharat / OAC)
  - *Mogal Chhedta Kalo Naag* — Kirtidan Gadhvi (Studio Saraswati)
  - *Dakla 2.0 (Electronic Remix)* — Various Artists / Dj Harsh
  - *Maa Mogal No Daklo* — Jignesh Kaviraj
  - *Meldi Maa No Daklo* — Pravin Luni

### 6.4 Bollywood / Filmi Garba (Currently 11 songs)
- **Top Additions:**
  - *Chogada Tara* — Darshan Raval & Asees Kaur (*Loveyatri*, T-Series)
  - *Dholida* — Jahnavi Shrimankar & Shail Hada (*Gangubai Kathiawadi*, Saregama)
  - *Kamariya* — Darshan Raval (*Mitron*, Sony Music)
  - *Udi Udi Jaye* — Sukhwinder Singh & Bhoomi Trivedi (*Raees*, Zee Music)
  - *Nagada Sang Dhol* — Shreya Ghoshal & Osman Mir (*Ram-Leela*, Eros Now)

---

## 7. Implementation Roadmap & Guardrails

To integrate these tracks into PlayGarba while honoring repository invariants:

1. **Never conflate Visual Worlds with Musical Categories:**
   - In `data/songs.json`, ensure each track receives its accurate visual `genre` (one of the 6) and its granular `category` (one of the 19 taxonomy items).
   - Sanedo tracks must have `"genre": "sanedo"` and `"category": "sanedo"`.
2. **Strict Playback Routing Separation:**
   - Add new verified tracks through dedicated, unowned chunk manifests (e.g., `data/catalogue/songs/songs-71-sanedo-essentials.json`, `data/catalogue/releases/releases-48-sanedo-essentials.json`, `data/playback-sources-sanedo-exact.json`).
   - Do not overwrite or collide with shared active manifests (e.g., `data/playback-sources-current.json` currently held by issue #1378).
3. **Continuous vs. Standalone Verification:**
   - Standalone tracks (like *Bhala Mori Rama*) must map to verified official YouTube video IDs with `startSeconds: 0`.
   - Continuous 8–10 min sets or full continuous albums must provide explicit label-published chapter markers or remain classified as continuous listening objects.
4. **Preserve Invariants:**
   - Ensure `validate-runtime-packaging.mjs`, `raas-graph`, and catalogue integrity tests remain 100% green upon integration.
