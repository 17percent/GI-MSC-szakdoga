# Vállalati tudásbázis — architektúra-terv és döntési napló

Egyedi fejlesztésű, webes tudásbázis-rendszer ~200 fős vállalat számára, markdown alapú tartalommal. Szakdolgozati projekt; a fejlesztés saját infrastruktúrán indul, az éles üzem céges környezetben valósul meg.

*Verzió: 7. — a H5-döntéssel (D27: munkacsomag-sorrend, kockázat-előrehozás elve) frissítve.*

## 1. Követelmények

- Markdown (.md) formátumú tudásanyagok tárolása — **kizárólag szöveges tartalom a repóban**; statikus képek (`.svg`, `.png`, `.jpeg` — ábrák, guide-ok, felületi design) megjelenítése az **alkalmazás szintjén kezelt assets mappából**, képfeltöltés nincs (lásd D15)
- Dokumentum-létrehozás három úton: üres canvas, **sablonból**, **duplikálással** — egységes „létrehozás forrásból" műveletként (D17)
- Teljes szövegű keresés (magyar nyelvi támogatással)
- Kategorizálás: **lapos címke-rendszer** — a kategória alkalmazásszintű entitás (CRUD), egy dokumentum több kategóriába tartozhat (D19)
- **Kedvencek:** privát, felhasználónkénti megjelölés és szűrés (D18)
- Státuszkezelés (draft → review → tesztelt → publikált), soft workflow-val
- Tulajdonos és módosító személyek nyilvántartása, teljes auditálhatóság
- Teszteltség / iterációk követése — a verziófogalom kettős: commit-történet (minden mentés) + frontmatter `iteration`; harmadik, kézi „verziószám" tudatosan nincs
- Verziókezelés, korábbi állapotok visszaállítása, **diff-nézet (MVP, D21)**
- Komment szekció tudásanyagonként, rendszereseményekkel; komment-szerkesztés és -törlés auditnyommal (D20)
- **Törlés-elv: minden törlés soft delete**, végleges törlés csak data retention policy szerinti időzített folyamatként (D20, részletek: NY4)
- Hordozható szoftver: új környezetben új adatbázissal és új autentikációval üzembe helyezhető
- **Vágólapra másolás és exportálhatóság** `.md`, `.pdf` és `.docx` formátumba — **MVP (D21)**

## 2. Architektúra áttekintés

```
Felhasználó (böngésző)
        │
        ▼
React SPA — Vite + React Router (react-md-editor, kommentek, keresés)
        │  REST API
        ▼
Backend API — Node.js + Fastify (TypeScript)  ──► OIDC szolgáltató
   │      │   └── pg-boss worker queue            (fejlesztés: Google,
   │      │       (Git-írások sorosítása)          éles: Microsoft Entra ID)
   │      ▼
   │   Lokális Git clone (tartós volume)   ← olvasás: log/diff/show helyben
   │      │  git push (SSH, pg-boss queue, simple-git)
   │      ▼
   │   Remote repo                          ← tartalom source of truth + backup
   │      (fejlesztés: GitHub privát repo,
   │       éles: Azure Repos)
   ▼
PostgreSQL   ← keresőindex (eldobható) + ELSŐDLEGES adat:
                események, kommentek, allowlist (mentendő!),
                lockok, user-cache
```

**Felelősség-megosztás:**

| Réteg | Feladata |
|---|---|
| Lokális Git clone | A tudásanyagok (.md) munkapéldánya: minden olvasás (történet, diff, korábbi verzió) helyben, API-hívás nélkül |
| Remote repo | Source of truth + tartalmi backup; fejlesztésben GitHub, élesben Azure Repos |
| PostgreSQL | Keresőindex (újraépíthető) ÉS elsődleges adatok: események/audit, kommentek, allowlist; lockok, user-cache |
| Backend API | Minden írás egyetlen kapuja; commit a felhasználó nevében; Git-műveletek sorosítása; indexfrissítés; lock-kezelés; eseménynaplózás |
| Frontend | Szerkesztés, böngészés, keresés, kommentfolyam, diff-megjelenítés |
| OIDC szolgáltató | Csak autentikáció (jelszó- és identitáskezelés kiszervezve) |

## 3. Döntési napló

### D1 — Tárolás: Git (source of truth) + PostgreSQL index
**Alternatívák:** tisztán PostgreSQL; hálózati meghajtó / Obsidian vault; kész platform (Outline, Wiki.js).
**Döntés indoklása:** a Git ingyen adja a verziótörténetet, a diffet, a visszaállítást és a fájlrendszer-szintű hordozhatóságot (a teljes tudásbázis egy clone-nal menthető). A Postgres a keresés és a metaadat-lekérdezések gyengeségét pótolja.
**Vállalat ára:** két mozgó alkatrész, a varratot (commit ↔ index) kezelni kell (lásd D4), a lokális clone ↔ remote varratot a D12 kezeli.

### D2 — Minden írás kizárólag a webes API-n keresztül
A repo közvetlen módosítása (GitHub/Azure Repos felületen vagy klónon át) szervezetileg tiltott. Így a lock-mechanizmus, az eseménynaplózás és az indexfrissítés megkerülhetetlen; webhook/polling szinkron külső változásokra nem szükséges. **A döntés kivétel nélkül érvényes: a repóban kizárólag .md tartalom él, a képek nem a repóban tárolódnak (D15), így képfeltöltési kivétel sem kell.**

### D3 — Backend-hitelesítés a repo felé: SSH kulcs, provider-agnosztikusan *(módosítva)*
**Döntés:** a backend SSH kulcspárral hitelesít a remote felé — ez GitHubon (deploy key) és Azure Repos-on azonos mechanizmus, így az átállás konfigcsere.
Nem személyes PAT és nem provider-specifikus App: a hozzáférés a rendszerhez tartozik, nem fejlesztő személyéhez, és nem köt providerhez.
**Környezetek:**
- Fejlesztés: privát GitHub repo a fejlesztő fiókja alatt, repo-szintű deploy key-jel (write joggal).
- Éles: **Azure Repos** a céges DevOps-szervezetben. Figyelem: az Azure DevOps SSH-kulcs **fiókszintű**, nem repo-szintű — ezért **dedikált service account** kell, amely kizárólag a tudásbázis-repóhoz fér hozzá; a kulcs ennek a fiókjában él.
**Kulcsvédelem: lásd D13. Éles bevezetés előtt tisztázandó: NY2 (branch policy).**

### D4 — Konzisztencia-szabály: a Postgres **index** eldobható — a Postgres NEM az *(pontosítva)*
A mentés sorrendje: Git commit → indexfrissítés. Ha az indexelés hibázik, a mentés attól még sikeres; hibakezelés automatikus reindexet indít. Az első naptól létezik `reindex` parancs, amely a repót nulláról végigolvasva felépíti a teljes indexet.
**Pontosítás:** az eldobhatóság kizárólag az indexre (`documents` indexelt mezői) igaz. Az `events`, `comments` és `allowlist` táblák **elsődleges, sehonnan újra nem építhető adatok** — a teljes auditnyom (a D6 kompenzációs mechanizmusa!) és a kommentfolyam itt él.
**Backup-stratégia (kötelező):** ütemezett `pg_dump` (napi), külön tárolóra (nem ugyanarra a diszkre/gépre), definiált retencióval; a visszaállítási eljárás dokumentált és legalább egyszer kipróbált. A repo tartalmi backupja a remote maga.
**Automatizált konzisztencia-őr:** minden dokumentumnál tárolt utolsó commit hash; ütemezett ellenőrzés veti össze a clone HEAD-jét az indexelt hash-ekkel, eltérésnél automatikus reindex indul és esemény naplózódik. A reindex így nem kézi vészintézkedés, hanem önjavító mechanizmus.

### D5 — Cserélhető autentikáció: generikus OIDC réteg
Fejlesztés alatt Google login, éles üzemben Microsoft Entra ID (céges App Registration). Az alkalmazás OIDC-szabványra épül, a szolgáltató konfigurációs kérdés — ez adja a hordozhatóságot is.
**Beléptetési kapu:** e-mail allowlist (Postgres-ben tárolva; kezdetben seed/konfig, később felületi karbantartás). A Google-login belső hálózatról is működik, csak a redirect URI-t kell regisztrálni.
**Kiegészítés:** az allowlist-tagság **minden API-kérésnél ellenőrzött**, nem csak beléptetéskor — az allowlistből eltávolított felhasználó hozzáférése azonnal megszűnik, nem a session lejártakor. Szigorú redirect URI-egyeztetés, teljes token-validálás (issuer, audience, lejárat) és CSRF-védelem az API-n.

### D6 — Nincs jogosultságkezelés: mindenki mindent lát és tehet *(kiegészítve)*
Minden belépett (allowlistes) felhasználó minden funkciót elér, és **minden tartalmat lát — ez kimondott cél, nem mellékhatás**: a tudásbázis rendeltetése a szervezeten belüli kollaboráció elősegítése, a teljes olvasási nyitottság ennek eszköze.
**Következmény (tartalompolitikai korlát):** a tudásbázisba kizárólag olyan tartalom kerülhet, amelyet a szervezet bármely tagja megismerhet. Ez bevezetéskor kimondandó szervezeti szabály.
**Kompenzáció az írási oldalon:** teljes átláthatóság — minden művelet (szerkesztés, státuszváltás, törlés, visszaállítás) eseményként naplózódik és a kommentfolyamban rendszerüzenetként megjelenik. A workflow-fegyelem szervezeti szabály, nem technikai kényszer: „technikailag nyitott, szervezetileg szabályozott."
**Vállalt korlát:** az auditnyom az írást fedi, az olvasást nem (olvasásnaplózás tudatosan nincs).

### D7 — Egyidejű szerkesztés: pesszimista lock + heartbeat
Szerkesztő mód aktiválásakor a backend lockolja a dokumentumot; más felhasználó tájékoztató üzenetet kap. A nyitott szerkesztő 30–60 mp-enként heartbeatet küld; a lock heartbeat nélkül 2–5 perc után automatikusan lejár (lecsukott laptop, bezárt fül eseteit magától kezeli). A kliens piszkozatot őriz, így a lejárat nem jár munkavesztéssel. „Lock átvétele" funkció: második ütem.

### D8 — Törlés: archívum + felületi visszaállítás
Törléskor a dokumentum archív állapotba kerül (nem vész el; a Git-történet is őrzi). Az archívumnak webes listázó/visszaállító felülete van; karbantartása kijelölt személy szervezeti felelőssége.

### D9 — Események és kommentek a Postgres-ben
A kommentek és a rendszeresemények nem a Git-ben élnek: `events` tábla a művelet-történetnek (ki, mit, mikor), ebből épül a dokumentumonkénti rendszerüzenet-folyam és a globális audit-nézet. (Mentésükről a D4 backup-szabálya gondoskodik.)

### D10 — Hosting: fejlesztés alatt saját szerver, élesben céges infrastruktúra
Docker Compose-ban futó teljes stack (frontend, backend, Postgres) — ez adja a környezetfüggetlenséget: az éles üzembe állítás konfiguráció (domain, OIDC, repo-elérés), nem átépítés. Publikus PaaS free tier (Vercel/Netlify) elvetve: licenc- és kapacitáskorlátok, plusz nem futtatnak tartós backendet és adatbázist.
**Vészhelyzeti elérés:** szerverleállás esetén a repo klónozható és Obsidiannal olvasható — ezt belső oktatás ismerteti. (Azure Repos-on ugyanígy működik.)

### D11 — Fejlesztési adathatár *(megerősítve és kiterjesztve)*
Éles céges tartalom nem kerülhet a fejlesztői környezetbe (otthoni szerver, privát repo); a fejlesztés **kizárólag dummy adatokkal** történik. Éles adat csak a céges környezetben születik.
**Kiterjesztés:** a **GitHub kizárólag fejlesztési környezet** — éles céges tartalom **soha, semmilyen formában nem kerül GitHub-ra**. Az éles rendszer remote-ja a szervezeti struktúrában már használt **Azure Repos**. Az átállás nem „transfer", hanem mirror push az új remote-ra + konfigcsere (remote URL, SSH kulcs) — a teljes történet átmegy, provider-oldali metaadat-függés nincs (lásd D12).

### D12 — Git-hozzáférés: git protokoll + lokális clone, provider API tilos *(új)*
**Döntés:** a backend egy tartós volume-on tárolt **lokális clone**-nal dolgozik, és kizárólag a git protokollt használja (SSH). Provider-specifikus REST API-ra (GitHub Contents/Commits API, Azure DevOps API) **építeni tilos**.
**Indoklás:** minden olvasó művelet — verziótörténet, diff, korábbi verzió megtekintése — lokális, ezredmásodperces `git log/diff/show`, nulla hálózati hívás, nulla rate limit; a felület diff- és történet-nézetei így olcsók. Egyben ez adja a provider-függetlenséget: a GitHub → Azure Repos átállás remote URL + kulcs csere.
**A varrat kezelése (lokális clone ↔ remote):**
- **Sorosítás:** minden Git-műveletet (commit, push) a backend **worker queue-n** (pg-boss, D22) keresztül, egyesével hajt végre — konkurens `index.lock` ütközés kizárva.
- **Push retry:** a mentés a lokális committal sikeres; ha a push hibázik (hálózat, remote-leállás), automatikus újrapróbálkozás exponenciális visszavárakozással.
- **Lemaradás-monitoring:** a rendszer méri és felületen/riasztásban jelzi, hány commituval van lemaradva a remote a lokális clone-tól; tartós lemaradás üzemeltetői riasztás (ez jelzi a visszavont/lejárt kulcsot is).
- A konténer-újraindítást a volume-on perzisztált clone éli túl; sérült clone esetén friss clone a remote-ról + reindex.

### D13 — Kulcs- és secret-kezelés *(új)*
- Az SSH privát kulcs (és minden más secret: OIDC client secret, DB jelszó) **soha nem kerül Docker image-be, repóba vagy commitolható `.env` fájlba**.
- Betöltés **Docker Compose secrets**-ként (vagy bind-mount `0600`, root-only jogosultsággal); kizárólag a backend konténer kapja meg.
- **Környezetenként külön kulcspár:** a fejlesztői kulcs csak a GitHub dummy-repóhoz, az éles kulcs csak az Azure Repos-hoz érvényes — a fejlesztői környezet kompromittálódása nem érinti az élest.
- Élesben dedikált service account (lásd D3); opcionálisan Azure Key Vault, ha a céges infrastruktúra adja.
- **Rotációs eljárás dokumentálva:** új kulcspár generálása → regisztrálás a remote-nál → konfigcsere → régi kulcs visszavonása. A D12 push-monitoringja a visszavont kulcsot azonnal láthatóvá teszi.

### D14 — Frontend stack: shadcn/ui + Tailwind + Motion *(új)*
A shadcn nem futásidejű függőség, hanem **bemásolt, saját tulajdonú komponenskód** — busz-faktor-1 projektnél előny: nincs breaking upgrade-kényszer, a karbantartás saját kézben van. A Tailwind-elköteleződés vállalt és kimondott. A Motion animációk funkcionális UX-visszajelzésre szolgálnak (mentés, lock-állapot, kommentfolyam-frissülés), nem öncélú effektekre.

### D15 — Tartalom-scope: csak szöveg a repóban; képek alkalmazásszintű statikus assets-ként; export második ütemben *(módosítva a 2. grilling után)*
- A tartalom-repo **kizárólag szöveges .md fájlokat tartalmaz**; képfeltöltés és csatolmány-kezelés nem funkciója a rendszernek.
- **Statikus képek** (`.svg`, `.png`, `.jpeg` — ábrák, guide-ok, felületi design) **az alkalmazás szintjén kezelt assets mappából** jelennek meg; a markdown az alkalmazás saját assets-útvonalára hivatkozik. Javasolt forma: az assets **mountolt volume** (nem az image részeként) — így új kép hozzáadása fájlmásolás, nem rebuild+redeploy.
- **Következmények (vállalva):** kép hozzáadása fejlesztői/üzemeltetői művelet, nem szerzői; a képek nem verziózódnak a tartalommal (csere visszamenőleg minden dokumentumverzióban érvényesül); a repo önmagában a szöveget adja teljes értékűen, a képeket nem (lásd 6. fejezet, vészhelyzeti elérés korlátja).
- **Export** `.md`, `.pdf` és `.docx` formátumba: **MVP-be emelve (D21, 3. grilling)**; a `.pdf`/`.docx` szerveroldali konverzióként tervezendő (pandoc), nem kliensoldali trükként; a `.md` letöltés és a vágólap-másolás kliensoldali, triviális.

### D16 — Markdown szerkesztő: @uiw/react-md-editor *(új)*
Könnyű, textarea-alapú szerkesztő élő előnézettel — illik a markdown-fegyelmű, csak-szöveg scope-hoz (D15), nem WYSIWYG-absztrakció.
**Kötelező kiegészítések:**
- **rehype-sanitize** mind a szerkesztő-előnézetben, mind az olvasó nézetben — a nyers HTML átengedése betárolt XSS-t jelentene (200 szerző, mindenki olvas).
- **Képforrás-korlátozás a sanitize-sémában:** kép (`img` / markdown képszintaxis) kizárólag az alkalmazás saját assets-útvonaláról renderelődik; külső URL-ű képhivatkozás nem jelenik meg (privacy-szivárgás — olvasói IP-k kiadása külső szervernek — és megbízhatósági kockázat ellen).
- Az olvasó nézet **ugyanazzal a remark/rehype pipeline-nal** renderel, mint a szerkesztő előnézete — a szerző mentés előtt pontosan azt lássa, amit az olvasó mentés után.
- A piszkozat-őrzés (D7) a szerkesztő körüli saját felelősség, nem a komponensé.

### D17 — Sablonok: a sablon is tudásanyag; „létrehozás forrásból" egységes művelet *(új, 3. grilling)*
**Döntés:** a sablon ugyanolyan .md tudásanyag, mint bármely más dokumentum — sablon-mivolta **metaadat** (frontmatter-jelölés, a felületen kategóriaszerű szűrőként jelenik meg). Nincs külön sablon-alrendszer: tárolás a repóban, kezelés a normál szerkesztőn át (D2-vel és D15-tel konzisztens), verziózott.
**Vállalt következmény (D6):** a sablonokat bárki módosíthatja — a sablonfegyelem szervezeti szabály, az auditnyom a védvonal.
**Implementációs egyesítés:** a *sablonból létrehozás* és a *duplikálás* ugyanaz a művelet — **„létrehozás forrásból"** —, csak a forrás más. Szemantika: az új dokumentum **új UUID-t** kap; tartalom és kategóriák másolódnak; **státusz = draft, owner = a létrehozó, iteration reset**; a forrás kommentjei és eseményei **nem** másolódnak; keletkezik `duplicated_from` esemény, amely mindkét dokumentumnál megjelenik (származás-nyomonkövetés). MVP.

### D18 — Kedvencek: privát, felhasználónkénti; az első valódi per-user elsődleges adat *(új, 3. grilling)*
**Döntés:** kedvencek funkció MVP-elemként — a felhasználó dokumentumokat kedvencnek jelölhet, a listák/keresés kedvencekre szűrhető.
**Láthatóság: privát** — kizárólag az adott felhasználó látja a saját kedvenceit. Ez konzisztens a D6 vállalt korlátjával: az átláthatóság az írási oldalt fedi, az olvasói preferencia (mint az olvasás maga) nem naplózott, nem publikus.
**Adat-kategorizálási következmény (D4 bővítése):** a `favorites` tábla **elsődleges, sehonnan újra nem építhető adat** → a pg_dump backup-körbe tartozik. Ezzel a `users` tábla sem tisztán eldobható cache többé (a kedvenc-rekordok hivatkoznak rá) — a backup egyszerűen a teljes adatbázist fedi, a megkülönböztetés elvi jelentőségű marad (mi építhető újra a repóból, mi nem).

### D19 — Kategóriák: lapos címke-rendszer, alkalmazásszintű entitásként *(új, 3. grilling)*
**Döntés:** a kategorizálás **lapos** (nincs hierarchia); egy dokumentum **több kategóriába** is tartozhat (címke-szemantika); a kategória **entitás az alkalmazásban**, CRUD-műveletekkel.
**Szabályok:** új kategóriát **bárki** létrehozhat (D6-tal konzisztens); **használatban lévő kategória nem törölhető és nem nevezhető át** — módosítás/törlés csak akkor, ha egyetlen dokumentum sem hivatkozik rá. Kategória-műveletek eseményként naplózódnak.
**A varrat (repo-önállóság vs. DB-entitás):** a frontmatter a kategória**nevek listáját** hordozza — a reindex ebből építi újra a hozzárendeléseket, a repo önmagában teljes értékű marad. Ezt az teszi biztonságossá, hogy használatban lévő kategória neve nem változhat, így a frontmatter-név soha nem évül el. Korlát: a még egyetlen dokumentumhoz sem rendelt (üres) kategória csak a DB-ben él → a `categories` tábla is mentendő adat.

### D20 — Komment-életciklus és általános törlés-elv: soft delete + retention *(új, 3. grilling)*
**Komment szerkesztése:** megengedett a szerzőjének; a módosítás **nyomot hagy** — `comment_edited` esemény őrzi a korábbi tartalmat (JSONB details), a felületen „szerkesztve" jelölés.
**Komment törlése:** **soft delete** — a felületen a komment *helye* megmarad („törölt komment" placeholder), az adatbázisban a rekord megjelölve, nem törölve; `comment_deleted` esemény naplózódik. Az átláthatóság (D6) így a kommentfolyamra is teljes.
**Általános elv (rendszerszintű):** a rendszerben **minden törlés soft delete** — dokumentum (D8 archívum), komment, kategória. Végleges (fizikai) törlés kizárólag **data retention policy** szerinti, időzített, automatizált folyamatként történik. A policy részletei (retenciós idők, mi törölhető véglegesen, GDPR-vonatkozások) később kerülnek kidolgozásra: **NY4**.

### D21 — Scope-emelés az MVP-be: vágólap, .md letöltés, diff-nézet, export *(új, 3. grilling)*
**Döntés:** a korábban második ütembe sorolt tételek közül MVP-be kerül: **vágólapra másolás** és **nyers .md letöltés** (kliensoldali, triviális); **diff-nézet UI** két verzió között (a motor kész — D12 lokális `git diff` —, a költség a megjelenítő komponens: react-diff-viewer / diff2html); **.pdf/.docx export** szerveroldali pandoc-pipeline-nal.
**Kimondott ár:** a pandoc-export az egyetlen MVP-elem, amely új szerveroldali függőséget hoz és önálló munkacsomag — az MVP 9-ről 13 pontra nőtt. A delegálási ütemtervben az export **hátrasorolt, utolsó csomag**: határidő-nyomás esetén ez esik ki elsőként.
**Scope-fegyelem szabály:** új funkcióigény kizárólag a döntési naplón keresztül léphet be (új D- vagy NY-pontként, ütem-besorolással) — ami nincs a naplóban, az nem épül meg.

### D22 — Backend stack: TypeScript end-to-end, Node.js + Fastify; worker queue: pg-boss *(új, B1)*
**Alternatívák:** NestJS (teljes keretrendszer); más nyelv a backendre (Python/Go/C#); queue-ra BullMQ (Redis) vagy saját sorosítás.
**Döntés indoklása:** egyetlen nyelv a teljes stackben — busz-faktor-1 projektnél a kontextusváltás-költség és a duplikált tooling megszűnése többet ér, mint bármely nyelv részelőnye. A Fastify könnyű, gyors, sémavezérelt (JSON Schema validáció — a B5 API-kontraktushoz illeszkedik), keretrendszer-kényszer nélkül. A **pg-boss** a meglévő PostgreSQL-re épül: **nincs új üzemeltetendő alkatrész** (nincs Redis), és a job-felvétel egy tranzakcióban élhet a DB-írással — ez a D4 konzisztencia-szabályához és a D12 sorosítási követelményéhez kifejezetten előny.
**Vállalt ár:** a pg-boss ökoszisztémája kisebb, mint a BullMQ-é; a use case (Git-írások egyesével sorosítva, alacsony áteresztés) ezt nem terheli. A NestJS strukturális kényszereiről lemondunk — a struktúrát a saját szerviz-rétegzés adja (lásd D24 GitService-elv).

### D23 — Frontend app-keretrendszer: Vite + React SPA, React Router *(új, B2)*
**Alternatívák:** Next.js (SSR/RSC); más SPA-keretrendszer (Vue, Svelte).
**Döntés indoklása:** a rendszer belső, login mögötti alkalmazás — SEO és SSR-igény nincs, a Next.js csak komplexitást (szerver-runtime, RSC-mentálmodell) hozna. A Vite + React SPA a legkisebb mozgó alkatrész; a már eldöntött komponens-ökoszisztéma (react-md-editor D16, shadcn/ui D14, diff-viewer D21) natívan ebben él. Kliensoldali routing React Routerrel.
**Vállalt ár:** SPA-jelleg — első betöltési bundle-méret és kliensoldali state-kezelés; belső eszköznél elfogadható, kód-splitting szükség szerint.

### D24 — Git-hívás a backendben: simple-git, saját GitService-absztrakció mögött *(új, B3)*
**Alternatívák:** nyers shell-out a git CLI-re (`child_process` saját wrapperrel); isomorphic-git (pure JS).
**Döntés indoklása:** a **simple-git** ugyanazt a natív git CLI-t hívja (a viselkedés azonos a kézzel kipróbálhatóval), de kész, típusos wrapperként — megspórolja a saját escape-elési és hibakód-parszolási réteget. Az isomorphic-git elvetve: a natív gittől eltérő viselkedés a diff/log műveleteknél kockázat, miközben a D12 miatt a git binárisra amúgy is építünk.
**Kikötés (architektúra-szabály):** minden Git-művelet egyetlen saját **`GitService`** modul mögött él; a simple-git ennek implementációs részlete. Ha a lib bárhol falba ütközik (egzotikus flag, hibakezelés), az adott művelet egy helyen cserélhető nyers shell-outra, az alkalmazás többi része nem érintett. A GitService kizárólag a pg-boss queue-ból hívható írásra (D12 sorosítás).

### D25 — Adatbázis-réteg és migráció: Drizzle *(új, B4)*
**Alternatívák:** node-pg-migrate (nyers SQL-migrációk, query-réteg külön megoldandó); Prisma (kényelmes DX, de saját sémanyelv és futásidejű réteg).
**Döntés indoklása:** a Drizzle TypeScript-sémadefiníciót, generált migrációkat és **típusos query buildert** ad egyben, miközben SQL-közeli marad — nem klasszikus ORM. Illeszkedik a D22-es end-to-end TypeScript elvhez: a séma típusai a backend-kódban közvetlenül érvényesülnek. A Prisma elvetve: a séma gerincét adó `tsvector` (magyar konfiguráció), `pg_trgm` és generált oszlopok nála kézi kerülőutat igényelnek.
**Kikötés:** a keresési infrastruktúra (extension-ök, generált `tsvector` oszlop, GIN indexek) **kézzel írt SQL-migrációként** él a Drizzle migrációs láncában (custom migration) — ezek nem fejezhetők ki a TS-sémában, és nem is kell erőltetni.
**Konkrét DDL:** a teljes séma külön tervdokumentumban (`tudasbazis-db-sema-b4.md`) — a napló 4. fejezete marad az elvi vázlat, a DDL-dokumentum a megvalósítási referencia.

### D26 — API-kontraktus: REST `/api/v1`, cookie-session + CSRF, RFC 9457 hibák, code-first OpenAPI *(új, B5)*
**Döntés (elvek, részletek: `tudasbazis-api-kontraktus-b5.md`, A1–A8):**
- **Session httpOnly cookie-ban** (az OIDC-token soha nem jár a böngésző JS-terében), `SameSite=Lax` + CSRF-token a mutáló kéréseken — a D5 CSRF-követelményének realizálása.
- **Hibaformátum: RFC 9457 Problem Details** + stabil gépi `code` mező (hibakód-katalógus a kontraktus-dokumentumban).
- **Mentés-szemantika:** a `PUT …/content` a sorosított **lokális commitot szinkron megvárja** (200 + új commit hash), a push aszinkron retry-jal fut (D12); **kötelező `baseCommitHash`** optimista ellenőrzéssel (412) a lock-lejárat utáni kései mentés ellen — a lock (D7) mellé második védvonal.
- **Code-first kontraktus:** a Fastify JSON Schema validáció (D22) az egyetlen forrás, az OpenAPI belőle generálódik (`@fastify/swagger`) — a validálás és a dokumentáció nem tud szétcsúszni.
- Lapozás `limit`/`offset`; kommentek + rendszeresemények **egyetlen szerverin fésült `feed`** végpontból (D9 vetítési elve); export szinkron streaminggel (job-infrastruktúra csak mért igénynél).
**Vállalt ár:** a cookie-session a frontendet same-origin üzemre köti (a Compose-stackben adott); a szinkron export nagy dokumentumnál timeout-kockázat — tudatosan a legolcsóbb megoldás, a hátrasorolt export-csomagot (D21) nem terheljük előre.

### D27 — Megvalósítási sorrend: 15 munkacsomag, kockázat-előrehozással *(új, H5)*
**Döntés:** a fejlesztés delegálható munkacsomagokban halad (WP0–WP14, részletek: `tudasbazis-munkacsomagok-h5.md`), sorrendi elvekkel:
1. **Kockázat-előrehozás:** a GitService + pg-boss queue (WP3) az egyetlen valóban kísérletezést igénylő komponens — közvetlenül a séma után épül, minden funkcionális csomag előtt; a simple-git korlátainak itt kell kiderülniük (D24 cserepont-elve miatt lokalizált kockázat).
2. **Gerinc először:** WP0–WP4 után végigjátszható mag létezik (login → létrehozás → mentés = commit); a levél-funkciók erre rakódnak, egymástól függetlenül, párhuzamosíthatóan.
3. **Hátulról védett demó-érték:** határidő-nyomásnál a csomagok hátulról előre esnek ki, elsőként az export (WP14) — összhangban a D21 hátrasorolásával.
4. **Csomag-zárási fegyelem:** minden csomag CI-zöld tesztekkel + a naplópontok visszaellenőrzésével zárul; új igény csak a naplón át (D21).
**Az MVP mind a 13 pontja csomaghoz rendelt** (lefedettségi tábla a dokumentumban); a verziótörténet/diff (MVP 3.) a korábban implicit helyéről explicit csomagot kapott (WP7).

## 4. Adatmodell-vázlat (PostgreSQL)

- `documents` — **stabil `id` (UUID, a rendszer generálja, soha nem változik; a frontmatterben is tárolva)**; út a repóban (attribútum, átnevezéskor változhat — az id nem!), cím, státusz, tulajdonos, **sablon-jelölés (is_template)**, utolsó commit hash, indexelt tartalom (`tsvector`, magyar konfiguráció + `pg_trgm` a ragozás-tűrő kereséshez), soft delete jelölés (archívum, D8)
- `categories` — kategória mint entitás: név (egyedi), leírás; *mentendő adat* (az üres kategória csak itt él, D19); használatban lévő nem törölhető/nevezhető át
- `document_categories` — dokumentum↔kategória kapcsolótábla (több-a-többhöz, D19) — *a repóból (frontmatter kategórianév-lista) újraépíthető*
- `favorites` — felhasználó↔dokumentum (privát kedvencek, D18) — *elsődleges adat, mentendő*
- `events` — dokumentum (**id-ra hivatkozik, nem útra**), típus (created/edited/status_changed/deleted/restored/renamed/**duplicated_from**/**comment_edited**/**comment_deleted**/**category_created** stb.), felhasználó, időbélyeg, részletek (JSONB — pl. komment korábbi tartalma szerkesztésnél) — *elsődleges adat, mentendő*
- `comments` — dokumentum (id), szerző, tartalom, időbélyeg, **szerkesztve-jelölés, soft delete jelölés (D20)**; rendszerüzenetek az `events`-ből vetítve — *elsődleges adat, mentendő*
- `locks` — dokumentum (id), felhasználó, megszerzés ideje, utolsó heartbeat
- `allowlist` — engedélyezett e-mail címek — *elsődleges adat, mentendő*
- `users` — OIDC-ből érkező identitások (név, e-mail, avatar); a `favorites` hivatkozásai miatt már nem tisztán eldobható cache (D18)

A frontmatter (YAML a .md fájl elején) hordozza a Gitben is a metaadatokat (**id**, status, owner, iteration, **categories: névlista**, **template-jelölés**) — az index ebből épül, így a repo önmagában is teljes értékű, és a dokumentum-identitás átnevezés után is megmarad (URL-ek, kommentek, események nem szakadnak el).

## 5. MVP scope és ütemezés

**MVP (kötelező a demóhoz):**
1. Google OIDC login + e-mail allowlist (kérésenkénti ellenőrzéssel)
2. Dokumentum CRUD webes markdown szerkesztővel (react-md-editor; mentés = commit a worker queue-n át); létrehozás üres canvasból, sablonból vagy duplikálással — egységes „létrehozás forrásból" művelet (D17)
3. Verziótörténet nézet + korábbi verzió visszaállítása (lokális clone-ból) + **diff-nézet UI két verzió között (D21)**
4. Teljes szövegű keresés (magyar konfig) + kategória(címke)/státusz szűrés + **kedvencek-szűrő**
5. Lock heartbeat-tel
6. Eseménynaplózás + kommentfolyam rendszerüzenetekkel; komment-szerkesztés és -törlés auditnyommal (D20)
7. Reindex parancs + automatizált konzisztencia-ellenőrzés (D4)
8. Archívum + visszaállítás felület
9. Postgres backup (ütemezett pg_dump) — üzemeltetési MVP-elem, nem halasztható
10. **Kategóriakezelés** — kategória-entitások CRUD-ja a védelmi szabályokkal (D19)
11. **Kedvencek** — privát megjelölés és szűrés (D18)
12. **Vágólapra másolás + nyers .md letöltés** (D21)
13. **Export .pdf/.docx** szerveroldali pandoc-pipeline-nal (D21) — *hátrasorolt csomag: határidő-nyomás esetén elsőként esik ki*

**Második ütem:** lock-átvétel, allowlist-karbantartó felület, státusz-riportok, data retention szerinti időzített végleges törlés (NY4).

**Jövőbeli munka (szakdolgozatban fejezetként):** Microsoft Entra ID integráció (App Registration, csoport-claimek), Azure Repos-ra állás (mirror push + konfigcsere), céges domain + TLS, esetleges olvasó-tükör.

## 6. Ismert korlátok, vállalt kockázatok

- A státusz-workflow nem kikényszerített (D6) — szervezeti fegyelemre épül, az audit-nyom a védvonal.
- **Az audit megbízhatósági gyökere az alkalmazás-backend:** a commitokat a backend készíti a rendszer-kulccsal, a commit author mező általa írt metaadat, kriptográfiai kötés nélkül. Az auditnyom hitelessége az alkalmazás integritásán áll — belső rendszernél vállalt kockázat, kimondva.
- Az átláthatóság az írást fedi, az olvasást nem; a teljes olvasási nyitottság tartalompolitikai korlátot jelent (D6).
- **Commit-identitás és adatvédelem:** a felhasználó neve/e-mailje a Git-történetben megváltoztathatatlanul megmarad, kilépő munkavállaló esetén is. Jogalapja a munkaköri tevékenység dokumentálása (jogos érdek); a szakdolgozat adatkezelési fejezetében rögzítendő.
- **A vészhelyzeti elérés (D10: clone + Obsidian) a szöveget adja, a képeket nem:** a képek az alkalmazás assets-ében élnek (D15), így a repo önálló olvasásakor a képhivatkozások törötten jelennek meg. A tudás szöveges lényege elérhető marad — a korlát vállalt és a belső oktatásban kimondandó.
- A magyar full-text keresés stemmer-minősége korlátos; a `pg_trgm` kombináció enyhíti, szemantikus keresés (pgvector) későbbi opció.
- Valós idejű közös szerkesztés (Google Docs-élmény) tudatosan nincs — a lock-modell zárja ki az ütközést.
- **Az MVP a 3. grilling után 13 pontos** — a scope-fegyelem szabály (D21) és az export-csomag hátrasorolása a kompenzáció; további bővítés csak naplón át.
- Egyszemélyes fejlesztés és üzemeltetés a bevezetésig: busz-faktor 1; a dokumentáció és az átadási terv ezért a projekt része.

## 7. Nyitott kérdések

- **NY1 — Statikus képek bekerülési útja: LEZÁRVA (2. grilling).** A képek nem a tartalom-repóban, hanem az alkalmazás szintjén kezelt assets mappában élnek (javasoltan mountolt volume); feltöltési funkció nincs, hozzáadásuk fejlesztői/üzemeltetői művelet. Részletek: D15.
- **NY2 — Azure Repos branch policy:** ha a céges DevOps-szabályzat kötelező PR-review-t ír elő a main branchre, az a „mentés = commit main-re" modellt ellehetetleníti. **A DevOps-adminnal egyeztetendő MOST, nem éles bevezetéskor** — szükség esetén a tudásbázis-repo policy-kivételt kap (a service account bypass jogot).
- **NY3 — Allowlist-karbantartás módja:** felület vs. konfig (korábbról nyitott; második ütem).
- **NY4 — Data retention policy (új, 3. grilling):** a soft delete-elt rekordok (kommentek, dokumentumok, kategóriák) végleges törlésének retenciós ideje, köre és GDPR-vonatkozásai; időzített, automatizált törlési folyamatként tervezendő. A felhasználó fejti ki — a részletek megérkezéséig minden soft delete-elt adat megmarad. Kapcsolódó feszültség előre jelezve: a Git-történet és az `events` auditnyom természeténél fogva nem felejt — a retention policy hatóköre valószínűleg csak a Postgres-oldali soft delete-ekre terjedhet ki reálisan; tisztázandó.
