# YouTube linkage backlog research — Garba catalogue

**Research date:** 2026-09-26  
**Purpose:** Find YouTube playback links for catalogue records that currently have Apple Music, Spotify, Amazon Music, or other metadata but no YouTube route. This is a separate research/attachment file; it does not change the canonical catalogue.

## Catalogue backlog at a glance

Snapshot from `data/songs.json` and `data/releases.json` (1,706 songs, 239 releases):

- **1,110 songs already have a YouTube ID; 596 do not.**
- The missing rows are not evenly distributed: Mataji devotional has 186; traditional Garba 116; modern Gujarati Garba 91; electronic fusion 32; tran-taali 30; raas/dandiya 26; folk/lokgeet 22; Krishna Garba 21; DJ remix 21; be-taali 17; dakla 10; hinch 5; live Garba 5; instrumental/cinematic 4; Sanedo 4; Bollywood/filmi 3; dodhiyu 2; hip-hop Garba 1. Roots/archive currently has no missing YouTube ID.
- The playback-provider field on the missing rows is metadata provenance, not a recommended destination: Amazon Music 386; Apple Music 123; Spotify 72; external 15.

| Original release decade | Catalogue songs | Missing YouTube ID |
|---|---:|---:|
| 1990s | 116 | 41 |
| 2000s | 347 | 169 |
| 2010s | 280 | 84 |
| 2020s | 959 | 301 |
| 1960s / 1970s / 1980s | 3 | 0 |
| Unknown | 1 | 1 |

The original year is release-level metadata. “Unknown” is left unresolved rather than inferred from an upload date.

## High-confidence individual-song candidates

These are the strongest matches found: YouTube results identify the song and singer on official artist/topic channels, and the page metadata names a relevant label/release. A YouTube upload date can be years later than the recording’s release date. Confirm the recording version against the catalogue before importing any link.

### 1993 — *Khelaiya: Non-Stop Disco Dandia, Vol. 93*

The catalogue has eight tracks under `khelaiya-disco-dandia-93-1993`; five have no YouTube ID. Google search results and YouTube pages surfaced the following official Topic tracks. Five listed tracks are missing from the catalogue’s YouTube linkage today; the catalogue already links *Der Mari Anguthadi No Chor* and *Tara Vina Shyam Mane*.

| Catalogue track | YouTube result | Match notes |
|---|---|---|
| Aavata Jata — Kishore Manraja | [Kishor Manraja - Topic](https://www.youtube.com/watch?v=xPgwkRiCFjk) | Opened on YouTube. Page title is “Aavata Jata”; page description says “Provided to YouTube by Ishtar Music Pvt. Ltd.”; duration 5:32. Strong title/artist match. |
| Der Mari Anguthadi No Chor — Rupal Doshi | [Rupal Doshi - Topic](https://www.youtube.com/watch?v=j9205_-CVbk) | Official Topic result; catalogue already has this linked. |
| Dholida Dhol Re Vagad — Rupal Doshi | [Rupal Doshi - Topic](https://www.youtube.com/watch?v=lPO7G8wlCqQ) | Official Topic result; title and singer match. Search also returned it as a chapter in newer DJ jukeboxes; prefer this single. |
| Mathe Matukadi — Rupal Doshi | [Rupal Doshi - Topic](https://www.youtube.com/watch?v=bCjS9gi5cLw) | Official Topic result; title and singer match. Search also surfaced a DJ edit and a chaptered compilation; don’t substitute those. |
| Nahi Melu Re — Rupal Doshi | [Rupal Doshi - Topic](https://www.youtube.com/watch?v=PjEeg-8vQGE) | Official Topic result; 6:09, title/singer match. |
| Tara Vina Shyam Mane — Kishore Manraja | [Kishor Manraja - Topic](https://www.youtube.com/watch?v=JJjKcSLDV8M) | Official Topic result; catalogue already has this linked. |
| Charar Charar Maro Chakdod — Kishore Manraja | [Kishor Manraja - Topic](https://www.youtube.com/watch?v=L_ReSC4KwUk) | Official Topic result; title/singer match. |
| **Full eight-song set** | [YouTube Music release playlist](https://www.youtube.com/playlist?list=OLAK5uy_kPLANplz8ufNZj84bmDeMUT36LEQXWujA) | YouTube shows the album as *Khelaiya- Non-Stop Disco Dandia, Vol. 93*, credited to Rupal Doshi and Kishore Manraj. The set playlist is useful for recovering its whole track order; use the individual Topic tracks where available. |
| Alternate continuous video | [Khelaiya- Non-Stop Dandiya 93 – Vol. 1](https://www.youtube.com/watch?v=qGPSIu_r48I) | Ishtar Gujarati; 58:37; 23M views. Likely same repertoire, but it is a separate continuous upload/version. Use for set discovery, not automatic per-track mapping. |

The YouTube Music set playlist appeared as an eight-song Ishtar Music album during this browser session. Individual Topic pages are better linkage targets than DJ variants or long compilations.

### 1999 — *De Taali*

The catalogue has 20 tracks under `de-taali-1999`, including ten without a YouTube ID. Google surfaced official **Falguni Pathak - Topic** uploads whose page snippets identify *De Taali* and Sony Music. Some titles include “Gujarati Garba Song.” These are high-confidence title/release candidates, subject to confirming catalogue spelling/versions.

| Missing catalogue track | YouTube link |
|---|---|
| Pethalpur Ma | [Pethalpur Ma (Gujarati Garba Song)](https://www.youtube.com/watch?v=jhdOOaEoFT4) |
| Aavo To Ramvane | [Aavo To Ramvane (Gujarati Garba Song)](https://www.youtube.com/watch?v=DE8sP3cOqcI) |
| Saathiaa Puravo Dware | [Saathiaa Puravo Dware (Gujarati Garba Song)](https://www.youtube.com/watch?v=Bx9HLq7Gw_s) |
| Morli To Chali | [Morli To Chali (Gujarati Garba Song)](https://www.youtube.com/watch?v=hJGVFeb_n4w) |
| Nahi Melure | Search result surfaced official Topic songs from the same album, but this exact title/link was not resolved in this pass. Search with “Nahi Melure” and the *De Taali* album before importing. |
| Pani Gayatare | Not resolved to an exact official-topic result in this pass. |
| Sawaa Man Sonu | Not resolved to an exact official-topic result in this pass. |
| Rame Ambe Maa | Not resolved to an exact official-topic result in this pass. |
| Chhanu Ne Chhapnu | Not resolved to an exact official-topic result in this pass. |
| Najar Na Jaam | Not resolved to an exact official-topic result in this pass. |

Additional *De Taali* official Topic tracks are already linked in the catalogue, including [Kaun Halave Limbdi](https://www.youtube.com/watch?v=LQhDueSZNrM), [Hadke Pepdo](https://www.youtube.com/watch?v=MuWbhu0vp2A), [Nadi Kinare Naliyeri](https://www.youtube.com/watch?v=kdp_LCFWfQQ), [Chhailaji Re](https://www.youtube.com/watch?v=2R5j3-5iooY), and [Mari Mahisagar Ne Aare](https://www.youtube.com/watch?v=av80juzfcQI). These help validate the official artist/release cluster.

### 1990 — instrumental disco dandiya

| Catalogue item | YouTube link | Match notes |
|---|---|---|
| Non Stop Dhamal Disco Dandia (Theme Song) (Instrumental) — Sanjay Sarkar | [Topic audio](https://www.youtube.com/watch?v=mdfCyh5lBxw) | Exact title surfaced for the 1990 Dhamal Disco Dandia instrumental release. Check the full album sequence before mapping other tracks. |
| Mahisagar (Gujarati Folk) (Instrumental) — Sanjay Sarkar | [Topic audio](https://www.youtube.com/watch?v=Hq5VhXVlE0o) | The result identifies Ishtar Music and a 1990 release; this track is already linked in the catalogue. |
| Jai Aadhya Shakti (Aarti) (Instrumental) — Sanjay Sarkar | [Topic audio](https://www.youtube.com/watch?v=ir_yjC3vTHg) | Exact title surfaced on the related volume. Verify the catalogue release/volume before assigning. |

## Non-stop sets and chaptered releases

These links cover several catalogue styles and decades. A set can be a useful browse/play option, but its chapter is not necessarily the original album master. Timestamped links are provided only where the YouTube description/search result exposed a usable chapter time.

| Style / catalogue gap | YouTube link | What the result supports |
|---|---|---|
| 1990s disco dandiya | [Khelaiya Vol. 1: Non-Stop Disco Dandiya](https://www.youtube.com/watch?v=NBt60JiIUTA) | Ishtar Regional; 57:22; official channel; 55M views. |
| 1990s disco dandiya | [Khelaiya Disco Dandiya Hits Vol. 2](https://www.youtube.com/watch?v=m9HCfrr6x_E) | Ishtar Regional; 1:09:08. Search snippet exposes the *Sona Vatakadi Re* segment at about 39:06; verify track and chapter on page before mapping. |
| Traditional / raas | [Khelaiya Vol. 4: Chhel Chhabilo](https://www.youtube.com/watch?v=l9pDOT3h7FE) | Ishtar Regional; 58:58. |
| Disco / DJ dandiya | [Gujarati Disco Dandiya DJ Garba Songs — Audio Jukebox](https://www.youtube.com/watch?v=ZcLhN7ptuTE) | Ishtar Regional; 1:02:07. Search snippets list *Aavata Jata* and *Dholida Dhol Re Vagad* with singers; DJ version, so keep separate from the 1993 original recordings. |
| Dandiya song collection | [Navratri Special: Best Dandiya Songs — Khelaiya](https://www.youtube.com/watch?v=8D1XsN7pfmQ) | Ishtar Regional; 1:46:55; Google reports 15 key moments. Search snippet places *Mathe Matukadi* near 07:24 and *Aavata Jata* near 14:53. Chapters are compilation evidence, not proof of same album master. |
| Dandiya song collection | [Khelaiya: Best Dandiya Songs](https://www.youtube.com/watch?v=vSmbJDI6iPM) | Ishtar Gujarati; 1:46:55; search snippets expose chapter/singer credits, including *Mathe Matukadi*. |
| Dandiya DJ instrumentals | [Bamboo Beats — Non-Stop Disco Dandia Instrumental 93](https://www.youtube.com/watch?v=Aud6j-BiIjM) | Ishtar Gujarati; 17:52; useful instrumental/remix candidate. |
| 2000s Mataji / devotional | [Jay Ho / Tahuko Part 9 — Nonstop Garba](https://www.youtube.com/watch?v=cAiAwvkvwpE) | Opened on the verified Soor Mandir Audio Jukebox channel; title names Kishor Manraja; 56:33; published Sep 26, 2020. Its description exposes a 21-chapter list. 20 chapter titles align with catalogue `jay-ho-vol9-2002`; `Koi Aarasur Jai` is not in the visible list, and catalogue `Datiyone Ranma Ropiya` differs from the chapter “Daityo Ne Ranma Rodya.” Strong release-family candidate, but do not bulk-map until those two discrepancies and set identity are resolved. |

**Jay Ho chapter matches visible on the set page** (link opens at the chapter):

| Catalogue title | Chapter link | Review |
|---|---|---|
| Chhand | [00:00](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=0s) | Exact title |
| Partham Parvati Putra | [01:32](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=92s) | Exact title |
| Ma Ne Poche Te Garba | [04:33](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=273s) | Exact title |
| Choto Choto Madine Man | [08:28](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=508s) | Exact title |
| Aavi Navratri Ni Ratyu | [12:58](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=778s) | Exact title |
| Rude Garbe Rame Chhe | [15:51](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=951s) | Exact title |
| Madi Tara Naam Chhe Hazar | [18:23](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=1103s) | Exact title |
| Chapti Bhari Chokha | [21:12](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=1272s) | Exact title |
| Sheriye Shariye Vage Chhe | [23:40](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=1420s) | Exact title |
| Datiyone Ranma Ropiya | [26:20](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=1580s) | Chapter says “Daityo Ne Ranma Rodya”; hold for title/version review |
| Madi Aaya Chachar | [27:27](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=1647s) | Exact title |
| Zanzariyu Zamke Chhe | [28:47](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=1727s) | Exact title |
| Aavi Aavi Chhe | [30:10](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=1810s) | Exact title |
| Aavo To Ramvane | [33:37](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=2017s) | Exact title |
| Aavo Aavone Madi | [36:59](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=2219s) | Exact title |
| Chachar Chockma | [41:15](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=2475s) | Exact title |
| Maa Mara Garba Ma | [44:41](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=2681s) | Exact title |
| O Gori Chham Chham | [46:58](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=2818s) | Exact title |
| Aarasurni Ambe Maa | [49:25](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=2965s) | Exact title |
| Tahuka Karto Jay Mataji | [51:25](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=3085s) | Exact title |
| Jay Bhavani Jai Jai | [53:50](https://www.youtube.com/watch?v=cAiAwvkvwpE&t=3230s) | Exact title |
| Koi Aarasur Jai | — | No matching English chapter found in the visible description; do not infer a timestamp. |

| Style / catalogue gap | YouTube link | What the result supports |
|---|---|---|
| Mataji / devotional classics | [Kishor Manraja — Traditional Garba Part 2](https://www.youtube.com/watch?v=IjD4HFfdPzQ) | Soor Mandir; 33:20. Search key moments include *Partham Parvati Putra* (00:00), *Sonal Garbo Shire Ambe Maa* (09:55), *Kumkum Na Pagla* (22:56), and *Aavo To Ramvane* (27:34). Same-singer/title evidence; not confirmed as the Jay Ho 2002 master. |
| 2008 devotional / Mataji | [Rangoli 1 — Hemant Chauhan, Pamela Jain](https://www.youtube.com/watch?v=K5SdqV_EuMA) | Soor Mandir; 14:53. Opened at the *He Madi Mari Ramva* chapter; YouTube showed the chapter title while playing. Description chapters: [Tu Kaline Kaliyani Re](https://www.youtube.com/watch?v=K5SdqV_EuMA&t=0s), [Rato Hariyo Dungar](https://www.youtube.com/watch?v=K5SdqV_EuMA&t=268s), [He Madi Mari Ramva](https://www.youtube.com/watch?v=K5SdqV_EuMA&t=450s), [Dholida Tu Aevo Te Dhhol](https://www.youtube.com/watch?v=K5SdqV_EuMA&t=586s), [Aabhlani Odhi Maa](https://www.youtube.com/watch?v=K5SdqV_EuMA&t=754s). Strong title/time matches to `rangoli-vol16-2008`, but the upload title credits Hemant Chauhan and Pamela Jain while the catalogue release artist is Pamela Jain & Shailendra Bharti. Resolve this performer/master mismatch before import; “Taro Hariyo Dungar” also appears as “Rato Hariyo Dungar” in the chapter list. |
| Older traditional / Atul Purohit | [Anand / Tahuko 8 — Pamela Jain, Atul Purohit, Musa Paik](https://www.youtube.com/watch?v=nAtpEjfZN2w) | Soor Mandir; about one hour. Google snippets expose *Maro Garbo* around 36:37 and other catalogue-like song titles later. Candidate for title-level matching, but the upload is *Anand* and should not be attached to `atul-maro-garbo-2000` without checking the whole chapter list. |
| 2000s traditional / raas | [Khelaiya Vol. 11: Tara Vina Shyam](https://www.youtube.com/watch?v=2PCksMPoDu8) | Ishtar Regional; 58 minutes; official channel; high-view nonstop set. Search result identifies the title in the series. |
| Current traditional / Krishna / raas | [Best Gujarati Garba Dandiya Jukebox 2025](https://www.youtube.com/watch?v=_-S5GL15lN8) | Ishtar Gujarati; 15 key moments. Search result chapters include *Kum Kum Na Pagla Padya* 07:26, *Aavta Jata Jara* 13:46, *Mathe Matukadi* 27:21, *Dholida Dhol Re Vagad* 50:25, *Nahi Melu Re* 58:19, and *Tara Vina Shyam* 1:04:27. These are useful chapter links to related repertoire; version equivalence is not established. |
| Electronic / fusion Garba | [O Gori Part 1 — Non-stop superhit Fusion Gujarati Garba](https://www.youtube.com/watch?v=ubzeVOC9Glg) | Surmandir; 25 minutes. Search results categorize this explicitly as fusion. |
| Fusion Garba | [O Gori — Nonstop Fusion Garba Audio Jukebox](https://www.youtube.com/watch?v=0jXVxbkXfwo) | Soor Mandir Audio Jukebox; 51 minutes; 10M views. |
| Folk / lokgeet plus Garba | [Ochhav — Non-Stop Gujarati Garba & Lok Geet 2023](https://www.youtube.com/watch?v=V4f5I_xJVoA) | Aditya Gadhvi Official Artist Channel; 47 minutes. Existing catalogue already links the *Ochhav Theme* single. |
| Krishna / raas | [Bansari — Nonstop Raas Garba / Krishna Raas](https://www.youtube.com/watch?v=-cIcpIPQPI8) | Soor Mandir Audio Jukebox; 1:01:00; Hemant Chauhan; 8M views. |
| Krishna / contemporary | [Vrindavan — Jigardan Gadhavi, Nonstop Raas-Garba](https://www.youtube.com/watch?v=_hjWm7MSV8k) | Jigrra Official Artist Channel; 29 minutes. |
| Mataji / traditional | [Shakti Part 1 — Non-Stop Gujarati Garba (Tahuko 4)](https://www.youtube.com/watch?v=9bNkfeFQkHA) | Soor Mandir; 29 minutes; Hemant Chauhan. |
| Contemporary non-stop Garba | [Soor — Aditya Gadhvi, Nonstop Garba 2024](https://www.youtube.com/watch?v=-BOwEJQRXPc) | BIKERIDER upload; 23 minutes; high views, but not the artist’s official channel. Treat as discovery only. |
| Contemporary Garba / lok | [Ochhav / related official channel browse](https://www.youtube.com/@AdityaGadhviOfficial) | Use the official artist channel for single-song lookups; prefer a matching official single over a compilation. |
| Dakla / Mataji folk percussion | [Maa Na Dakla — Non-Stop Gujarati Garba Songs](https://www.youtube.com/watch?v=Ax3wODyUM7U) | RDC Gujarati; short result, title and description identify *Madi Tara Aghor Nagara Vage*. Older channel upload; inspect track metadata before assigning. |
| Dakla / EDM | [Dakla Garba Room — Nonstop EDM Dakla](https://www.youtube.com/watch?v=vELNnhro3C0) | Sur Sagar Music; Laxmi Gadhvi; 7:54; 170K views. |
| Dakla / live folk | [Navratri Nonstop Dakla — Kinjal Rabari](https://www.youtube.com/watch?v=hHpwj5wFJ7E) | Bhumi Na Sur; 12:04; search snippet names Kinjal Rabari and location/band credits. Community performance, not automatically a studio master. |
| Dakla / extended folk set | [Hemant Chauhan — Non Stop Gujarati Dakla Song](https://www.youtube.com/watch?v=BkUOI-tcf8c) | RDC Gujarati; 32:44; result identifies *Dum Dum Dakala Vage*. |
| Dakla / 2010s DJ mix | [Gujarati Dakla DJ Mix 2016 — He Mara Modavade](https://www.youtube.com/watch?v=B3rGXfumKW8) | RDC Gujarati; 19:06; useful for the DJ/dakla branch. |
| Dakla / large collection | [DJ Dakla Ni Dhamal — Madi Ma Na Dakla](https://www.youtube.com/watch?v=kFD8dAO41bM) | RDC Gujarati; 34:02. |
| Dakla / folk album | [Padkaaro 2.0 — Amit Dhorda](https://www.youtube.com/watch?v=Yzwne3YsrGM) | Amit Dhorda channel; 10:57; description/search result classifies it as “Dakla – Lokgeeto.” |
| Mataji / current nonstop | [Jordar DJ Garba — Gaman Santhal & Kajal Maheriya](https://www.youtube.com/results?search_query=Jordar+DJ+Garba+Nonstop+Gaman+Kajal+official) | Search landing page only; search returned multiple titles matching `jordar-dj-garba-nonstop-gaman-kajal-2022`. Candidate list from the catalogue includes *Mara Mobilema Maa No Photo*, *Mari Meldi Maa*, *Heer Gajro*, *Jog Maya Jogani*, and *Bahuchar Maa Mori Mavadi*. Resolve official uploads individually; DJ edits are not interchangeable with originals. |

## Release backlog priorities

Start with these release groups because each has many missing IDs and an existing provider album/source to anchor a title-by-title YouTube search. Counts below are missing YouTube IDs, not release track totals.

| Priority release | Missing | Category / decade | Research route |
|---|---:|---|---|
| `rangoli-vol16-2008` | 23 | Mataji devotional / 2000s | Compare full Soor Mandir chapter list to album metadata; settle performer discrepancy. |
| `jay-ho-vol9-2002` | 22 | Mataji devotional / 2000s | Check Soor Mandir *Jay Ho/Tahuko Part 9* and Topic singles for all 22 titles. |
| `dhara-rankar-2025` | 21 | Traditional Garba / 2020s | Search Dhara Shah / official Sur Sagar channel for the 21 track names, starting *Aavi Aaso Ni*, *Ghor Andhaari Re*, *Kanudo Kamangaro Re*, *Khel Khel Re*, *Rangalo*. |
| `re-lol-vol7-2000` | 20 | Mataji devotional / 2000s | Match the full *Re-Lol Vol. 7* order against official Topic / Soor Mandir pages. |
| `jordar-dj-garba-nonstop-gaman-kajal-2022` | 19 | DJ remix / 2020s | Search official singer/label uploads per song; reject mismatched remix/edit versions. |
| `anand-vol8-2001` | 18 | Mataji devotional / 2000s | Investigate *Anand/Tahuko 8* chapters; verify album title and singer credits. |
| `ho-raj-fusion-2001` | 18 | Electronic fusion / 2000s | Search song titles on YouTube; prioritize the source album match over later fusion covers. |
| `hemant-ghammar-vol3-2008` | 18 | Mataji devotional / 2000s | Search Hemant Chauhan official/topic and label uploads against its 18 missing rows. |
| `rangili-ramzat-8-kirtidan-2025` | 17 | Mataji devotional / 2020s | Search official artist channels for the album’s four-singer credits and exact versions. |
| `pooja-garba-ni-ramzat-4-0-album-2025` | 16 | Modern Gujarati Garba / 2020s | Pooja Kalyani / Maulik Mehta tracks; check artist/label uploads individually. |
| `saybo-nonstop-garba-2022` | 15 | Traditional Garba / 2020s | Find the official nonstop set and identify title/chapter times before mapping. |
| `atul-tara-vina-shyam-2000` | 15 | Traditional Garba / 2000s | Search Atul Purohit official and Soor Mandir chaptered sets. |
| `de-taali-1999` | 10 | Raas/dandiya / 1990s | Several official Falguni Pathak Topic singles surfaced; resolve the remaining six missing rows. |
| `mataji-tran-taali-2001` | 10 | Mataji devotional / 2000s | Search the named singers plus individual title; distinguish 3-taali live recordings from studio Garba. |
| `non-stop-garba-2016` | 12 | Modern Gujarati Garba / 2010s | Search Kinjal Dave official/topic uploads and verify the 2016 collection title. |

## Genre coverage and next searches

The existing 19 categories are all included in the inventory above. The strongest YouTube discovery lanes from this pass are:

- **Raas/dandiya:** Khelaiya volumes, *De Taali*, official Topic singles, chaptered Ishtar jukeboxes.
- **Mataji devotional:** *Jay Ho*, *Rangoli*, *Anand*, *Re-Lol*, *Ghammar*, *Dakla* and singer/topic channels.
- **Traditional Garba / raas:** Atul Purohit/Soor Mandir, *Saybo*, *Khelaiya*, chaptered jukeboxes.
- **Modern Gujarati Garba:** official artist channels and newer releases; the large current catalogue volume makes artist-by-artist matching more useful than one generic nonstop result.
- **Electronic fusion / DJ remix:** *O Gori*, *Ho Raj*, and the Gaman/Kajal DJ set; keep remixes as distinct recordings.
- **Folk/lokgeet:** Aditya Gadhvi’s *Ochhav*; cross-check that every Garba/lokgeet compilation track belongs in the target genre before mapping.
- **Dakla:** RDC Gujarati, Sur Sagar Music, Bhumi Na Sur, and artist uploads surfaced several non-stop/EDM/live branches; the verified Sur Sagar playlist includes a direct Dakla Garba Room upload.
- **Krishna Garba / devotional:** *Bansari*, *Vrindavan*, and individual singer tracks.
- **Tran-taali / Sanedo:** Red Ribbon’s *Aye Halo Part 3* explicitly includes Teen Tali and Sanedo; confirm song-level titles before mapping. **Be-taali, hinch, dodhiyu, live Garba, Bollywood/filmi and instrumental/cinematic:** local rows still need exact singer/title-specific searches. Studio Sangeeta’s Titodo and six-step sets are related step-style collections, not proof of a matching catalogue master.

## Additional YouTube playlists supplied and checked in browser

I opened the YouTube playlist/channel pages directly. These are useful set-discovery and genre-coverage sources; they are not all per-song matches to the catalogue. Counts below are what YouTube displayed at check time and can change. The non-YouTube links included in the supplied text (Spotify, JioSaavn, YouTube Music search, and editorial pages) are omitted from this YouTube-only playback list.

| Supplied lead | What the YouTube page showed | Best use / caution |
|---|---|---|
| [Sur Sagar Music — Ultimate Non Stop Garba 2026](https://www.youtube.com/playlist?list=PLeMnggaMTpf3GCbar9NLU7Vi1MzDimgEd) | Official verified Sur Sagar Music playlist; 43 videos. It includes Rangtaali 2, Ramzat volumes, KHAMMA and KHAMMA 2 (hip-hop Garba), Dakla Garba Room, Garba Room EDM, traditional/retro Garba, Krishna collections, and newer festival mixes. | Strongest broad genre-discovery list from the supplied links. Useful item pages include [Rangtaali 2](https://www.youtube.com/watch?v=O11shxGqC78), [Ramzat 5](https://www.youtube.com/watch?v=g2G7XwHerBU), [Ramzat 4](https://www.youtube.com/watch?v=hUGpQoom994), [KHAMMA](https://www.youtube.com/watch?v=VEpmBil3O6g), [KHAMMA 2](https://www.youtube.com/watch?v=0U3i-GuKZoE), [Trishul 1](https://www.youtube.com/watch?v=RAOrI-rgnhE), [Dakla Garba Room](https://www.youtube.com/watch?v=vELNnhro3C0), [Sathiya Part 3](https://www.youtube.com/watch?v=LfMmKdhAPXA), [Ghammar Part 1](https://www.youtube.com/watch?v=1QMzuDujmpQ), and [Ghammar Part 2](https://www.youtube.com/watch?v=Btc67oi39Kw). The playlist title is broad, but many items are distinct albums/styles—keep each source separate. |
| [Jigrra — Non Stop Garba](https://www.youtube.com/playlist?list=PLWfMLjZuX3nECAxZMzh1fTphRH1UxZvEj) | Playlist by Jigrra; 13 videos. It includes [Vrindavan](https://www.youtube.com/watch?v=_hjWm7MSV8k) (29 minutes), [Rangtaali 2 with Aishwarya Majmudar](https://www.youtube.com/watch?v=O11shxGqC78) (1:09), plus individual songs and other label sets. | Good Jigrra/Rangtaali discovery source, but it is a mixed playlist, not a single “Rangtaali Series” album. |
| [Navratri Garba Collection — Garba Universe](https://www.youtube.com/playlist?list=PLo1doBYPwAV5ngQpybY6P-E5XZZ9_KBnf) | 136 videos; YouTube indicated unavailable videos are hidden. The visible list includes official Sur Sagar items, Pritee Varsani, and Aishwarya Majmudar. | Large community-curated discovery queue, not an official label archive. Low visible view count and hidden unavailable videos make per-title validation important. |
| [Kinjal Dave No Rankar — Studio Saraswati Official](https://www.youtube.com/playlist?list=PLzv8rErGH5BybcvMHYluYLcbniRulnGVC) | Verified Studio Saraswati Official playlist; 19 videos. Includes *No Rankar 1* and *No Rankar 2* multi-part nonstop uploads from around 2016. | High-priority for the catalogue’s 2016 Kinjal Dave / `non-stop-garba-2016` gap. Compare each song/chapter with the metadata before assigning. |
| [Studio Sangeeta — Navratri Garba / Nonstop Garba](https://www.youtube.com/playlist?list=PL16ZwHkkMW3DljTdK8Wl4gOAEh_LUi1Tg) | Verified Studio Sangeeta playlist; 29 videos. Includes [Titodo — nonstop Dandiya / Titoda steps](https://www.youtube.com/watch?v=YRQV7nsbGEY) (1 hour), a [six-step Rangtaali set](https://www.youtube.com/watch?v=Ysay16mHO6w) (30 minutes), and multi-hour Dandiya collections. | Useful for raas/dandiya step-style discovery. The playlist listing inspected did not establish the claimed Sanedo examples; use the separate Red Ribbon source below for that style. |
| [Soor Mandir — Full Tahuko Series](https://www.youtube.com/playlist?list=PLiOkCwQzPydzdydCDivPl5dsz5xjShJoN) | Verified Soor Mandir playlist; 67 videos with one unavailable video hidden. Visible early entries include Hemant Chauhan *Navrang* Parts 1 and 2, *Maa Part 2 / Tahuko 5*, and *Shakti Part 2 / Tahuko 4*. | Strong traditional/devotional source. The visible items are separate 29–32 minute sets; do not describe the whole playlist as one continuous multi-hour recording. |
| [Red Ribbon Gujarati — Raas and Garba Nonstop](https://www.youtube.com/playlist?list=PLmqrFPgo0jM0lQ2xOBm6Nqnb0KWDgbybj) | Playlist page title: “Navratri 2026: Raas & Garba Nonstop”; 58 videos. Visible uploads include 56–71 minute collections. | Direct relevance to style gaps: [Aye Halo Part 3 — Teen Tali, Sanedo, Bhai Bhai, Aarti & Stuti](https://www.youtube.com/watch?v=4n5KfY7HT2o) is a 57-minute entry; [Aye Halo Part 1](https://www.youtube.com/watch?v=newv9uVqWaU) and [Part 2](https://www.youtube.com/watch?v=ySEc9h855wU) are also listed. Match individual titles/singers before catalogue import. |
| [Saregama Gujarati — NonStop Garba Hits](https://www.youtube.com/playlist?list=PLUzteH3czVO4o5bHKQAa6u84ErXs-EULL) | Verified Saregama Gujarati playlist; **2 videos**, not a large archive: *Taalratri 2.0* by Meet Jain (31 minutes) and [Thangannat / DJ Nihar](https://www.youtube.com/watch?v=PXbzSGNsM1Y) (49 minutes). | Useful for 2020s contemporary / DJ set discovery; the playlist title is broader than its two-item contents. |
| [Pritee Varsani — Gujarati Garba & Folk Hits](https://www.youtube.com/playlist?list=PLeMnggaMTpf261pJAEhx21vFaRCk8xjJr) | Sur Sagar Music playlist; 6 videos, with individual 4–6 minute uploads visible. | Useful for folk/lokgeet and modern folk singles, not a nonstop set despite the broader original description. |
| [Falguni Pathak Garba — Nova Gujarati playlist](https://www.youtube.com/playlist?list=PLYU8dY1GgSkQBwHNYgkX61pRaRCPf1w8D) | Playlist title is “Non Stop Garba Songs | Falguni Pathak Garba…”; it has 11 videos and is owned by Nova Gujarati. Visible entries include Falguni-themed sets, generic dandiya mixes, a short standalone track, and a teaser. | A curated playlist, not Falguni Pathak’s official channel playlist; inspect each item’s uploader and recording before using it for an exact catalogue match. |
| [United Way of Baroda — channel playlists](https://www.youtube.com/c/UWayBaroda/playlists) | The channel page identifies the organization and shows 148 videos. Visible event playlists include 2025 (6 videos), 2024 (12), 2023 (6), 2020 (10), and 2019 (11). | The inspected playlist page does **not** support the claim that this is a daily archive of 3–4-hour continuous sets. It is an event-channel archive with multi-video playlists; check each event upload’s duration and audio format. |
| [Atul Purohit Official](https://www.youtube.com/c/AtulPurohitOfficial) | Resolves to Atul Purohit’s Official Artist Channel; page described Garba, Bhajan, live performances and releases. It showed 242 videos. | Good source channel for Atul singles/live routes. The inspected page did not verify the supplied claim about a dedicated “Rangrasiya Nonstop Raas” playlist as a single official set; search the channel’s playlist tab and match album/video titles. |

### Individual videos from the supplied list, checked

| Link | Visible YouTube title/channel | Use / caution |
|---|---|---|
| [Hemant Chauhan nonstop](https://www.youtube.com/watch?v=-q-FMahr7uM) | “Hemant Chauhan Non Stop Garba \| Navratri Special Garba \| All Time Hit Garba Tahuko Series,” Soor Mandir, uploaded 9 days before this check. | Current official-label nonstop upload; not a direct catalogue release match without its track list. |
| [Tran Tali Nonstop Garba](https://www.youtube.com/watch?v=KVFy1ck9qgo) | “Tran Tali Nonstop Garba \| Best Of Soor Mandir Garba \| Non Stop Navratri Garba,” Soor Mandir, 1:26:28, about 4 years old. | Strong set-discovery lead for tran-taali. It is a compilation; map individual tracks only from its published chapter list. |
| [Ghammar Nonstop Garba Part 2](https://www.youtube.com/watch?v=Btc67oi39Kw) | Sur Sagar Music playlist item; title credits Praful Dave, Pamela Jain, Parthiv Gohil and others. | Confirmed as Part 2 in the official Sur Sagar playlist; separate from Part 1. |
| [Falguni Pathak Garba Songs / Garba Nights](https://www.youtube.com/watch?v=l8B1cJLOZB0) | “Falguni Pathak Garba Songs \| Garba Nights \| Nonstop Gujarati Garba Hits \| Dandiya Songs,” Tips Gujarati, 1:01:36; uploaded 3 days before this check. | The supplied description called this a recent Falguni Pathak release. The visible uploader is Tips Gujarati, not Falguni Pathak’s official channel; use it as a themed compilation only. |
| [Trusha Singer Nonstop Garba 2026](https://www.youtube.com/watch?v=F7FHXcihucU) | “TRUSHA SINGER Nonstop Garba 2026,” DJ AK OFFICIAL, 1:02:50. | Corrects the supplied “Love Garba Jukebox” label; discovery-only until the actual track list/version is inspected. |
| [Top 10 Superhit Gujarati Garba](https://www.youtube.com/watch?v=iweO4tmfGyQ) | “Top 10 Superhit Gujarati Garba \| Nonstop Navratri DJ Garba,” Rang Raas Studio, 37:03; YouTube marks the page as AI-generated content. | Keep as a low-confidence DJ discovery result; do not map its claimed track sequence to canonical songs without checking each recording. |

This browser check also confirms *Vrindavan* and the cited *Rangtaali 2* upload appear in more than one playlist; duplicate playlist appearances are not separate recordings. The 2026 Sur Sagar playlist provides several promising catalogue-cluster searches: `ramzat5-album-2024`, `ramzat-2-tran-taali-2018`, the current Ramzat releases, `khamma-tran-taali-2023-legacy`, and the 2025 Dakla/DJ styles. Confirm release/version identity against the individual page before adding a per-song route.

## Linkage rules for the next catalogue pass

1. Prefer a YouTube Topic / official artist / label upload whose page metadata matches song title, performer, and release/label. The *Khelaiya 93* and *De Taali* Topic results are promising examples.
2. Use chapter timestamps only when the displayed chapter title and singer/version are supported. Include a timestamped URL for a chapter mapping. A long video title alone is not proof that a catalogue song appears in it.
3. Keep DJ edit, remix, live performance, later remake, and original studio track as distinct source versions. Do not map the nearest similarly titled recording.
4. Save playlist URLs as set/discovery options; they do not substitute for a verified per-song YouTube route.
5. Persist only YouTube IDs and chapter offsets in playback fields. Keep Apple Music / Spotify / Amazon Music URLs as metadata provenance and search keys.

Public YouTube links are useful platform playback routes, but the uploader can remove them or access can change. A link or embed does not grant permission to download, host, or redistribute the audio, and it does not guarantee perpetual free access. This research only records public links; it does not include or host audio.

## Browser searches and pages checked

Research used the live Chrome browser, Google results, and YouTube pages/search results on 2026-09-26. Relevant focused queries included:

- `site:youtube.com/watch "Khelaiya- Non-Stop Disco Dandia, Vol. 93"`
- `site:youtube.com/watch "Mathe Matukadi" "Kishore Manraj"`
- `site:youtube.com/watch "De Taali" Garba 1999 Gujarati`
- `site:youtube.com/watch "Rangoli" "Pamela Jain" "Bar Bar Mahine Aavya"`
- `site:youtube.com/watch Garba Dakla nonstop official Gujarati song`
- Supplied playlist pages opened directly: Sur Sagar Music, Jigrra, Garba Universe, Studio Saraswati, Studio Sangeeta, Soor Mandir, Red Ribbon Gujarati, Saregama Gujarati, Pritee Varsani, Nova Gujarati, United Way of Baroda, and Atul Purohit Official.
- `site:youtube.com/watch "Jay Ho" "Tahuko" "Chhand" "Kishor Manraja"`

Opened the *Rangoli 1* chaptered video and confirmed the current page title, channel, and the *He Madi Mari Ramva* chapter at the linked time. Opened the *Aavata Jata* Topic video and confirmed its title, Kishor Manraja - Topic channel, 5:32 duration, and Ishtar Music page-description credit; paused after the short identity check. No full playlists were listened through. YouTube served a 15-second pre-roll ad on the Jay Ho page despite no ad on the earlier single-song check; it was paused before the Garba audio began.
