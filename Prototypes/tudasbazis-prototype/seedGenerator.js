/* seedGenerator.js — a prototípus dummy adatainak ELŐÁLLÍTÓJA. Önálló modul.
 *
 * Korábban a `data.js` kézzel kiírt, 8 darab hardkódolt dokumentumot tartalmazott.
 * Az Élő Atlasz szerkezetét ennyi doksin nem lehet érdemben megítélni, ezért
 * a seed innentől GENERÁLT: ez a modul állítja elő induláskor.
 *
 * Publikus API:
 *   generateSeed({ seed, docCount })
 *     -> { users, allowlist, notAllowedUser, categories, docs, comments, events,
 *          favorites, meta: { seed, docCount, plan } }
 *
 * DETERMINISZTIKUS. A „véletlen" egy seed-elt PRNG-ből jön (nincs `Math.random`),
 * mert az Atlasz elrendezése is determinisztikus: ugyanaz a seed → ugyanaz a
 * korpusz → ugyanaz a térkép, újratöltés után is. A seed a `data.js`-ben
 * állítható, illetve `?seed=<szám>` URL-paraméterrel felülírható — így egyetlen
 * újratöltéssel teljesen más korpuszon lehet megnézni, hogyan viselkedik a térkép.
 *
 * MIT tartalmaz a korpusz? A tudástár AI-ESZKÖZÖKET őriz, ezért a generált
 * dokumentumok is azok: promptok, skillek, rendszerutasítások, sablonok,
 * guide-ok, best practice-ek, agent-definíciók és kiértékelő készletek. A
 * kategória tehát a dokumentum FAJTÁJA, nem témakör — egyetlen dimenzió, így a
 * térkép klaszterei olvashatók: egy klaszter = egy eszközfajta.
 *
 * A korpusz szerkezete nem uniform-véletlen, hanem TERVEZETT (lásd `CATEGORY_PLAN`):
 * szándékosan van benne nagy és kicsi klaszter, egydokumentumos kategória (izolált
 * csomópont), üres kategória (facet-demó), kategória nélküli doksi („Egyéb"
 * gyűjtő) és több kategóriába tartozó, két klasztert összekötő „híd" dokumentum.
 * A véletlen a részleteket adja (melyik cím hova, ki írta, mikor, milyen státusz).
 */
(function (global) {
  'use strict';

  var MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  var STATUSES = ['draft', 'review', 'tesztelt', 'publikált'];

  // Státusz-súlyok: a korpusz nagy része publikált/tesztelt, de legyen elég
  // vázlat és review is, hogy a státusz-szűrő mindegyikre adjon találatot.
  var STATUS_WEIGHTS = [
    { v: 'draft', w: 3 },
    { v: 'review', w: 3 },
    { v: 'tesztelt', w: 4 },
    { v: 'publikált', w: 8 }
  ];

  // ---------- determinisztikus PRNG (mulberry32) ----------
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    function next() {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    var rng = {
      next: next,
      int: function (n) { return Math.floor(next() * n); },
      between: function (a, b) { return a + Math.floor(next() * (b - a + 1)); },
      chance: function (p) { return next() < p; },
      pick: function (a) { return a[Math.floor(next() * a.length)]; },
      shuffle: function (a) {
        var c = a.slice(0), i, j, t;
        for (i = c.length - 1; i > 0; i--) {
          j = Math.floor(next() * (i + 1));
          t = c[i]; c[i] = c[j]; c[j] = t;
        }
        return c;
      },
      weighted: function (pairs) {
        var total = 0, i, r;
        for (i = 0; i < pairs.length; i++) total += pairs[i].w;
        r = next() * total;
        for (i = 0; i < pairs.length; i++) {
          r -= pairs[i].w;
          if (r <= 0) return pairs[i].v;
        }
        return pairs[pairs.length - 1].v;
      },
    };
    rng.pickN = function (a, n) { return rng.shuffle(a).slice(0, n); };
    return rng;
  }

  // ---------- szöveg-segédek ----------
  var FOLD_FROM = 'áàâäãåéèêëíìîïóòôöõúùûüőűçñ';
  var FOLD_TO = 'aaaaaaeeeeiiiiooooouuuuoucn';

  function slug(s) {
    var out = '', i, k, ch;
    s = String(s == null ? '' : s).toLowerCase();
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      k = FOLD_FROM.indexOf(ch);
      out += k >= 0 ? FOLD_TO.charAt(k) : ch;
    }
    return out.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'dokumentum';
  }

  function initialsOf(name) {
    var parts = String(name).split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  // ---------- felhasználók ----------
  // A design system avatár-palettája 4 slotot ad (tokens.css --avatar-1..4),
  // ezért a slot körbejár — a szín a rendszertől jön, nem az adattól.
  var USER_NAMES = [
    'Tóth Máté', 'Kiss Anna', 'Nagy Béla', 'Varga Eszter',
    'Horváth Gábor', 'Szabó Júlia', 'Molnár Péter'
  ];

  var EMAIL_LOCAL = {
    'Tóth Máté': 'mate.toth', 'Kiss Anna': 'anna.kiss', 'Nagy Béla': 'bela.nagy',
    'Varga Eszter': 'eszter.varga', 'Horváth Gábor': 'gabor.horvath',
    'Szabó Júlia': 'julia.szabo', 'Molnár Péter': 'peter.molnar'
  };

  function buildUsers() {
    var out = [], i, name;
    for (i = 0; i < USER_NAMES.length; i++) {
      name = USER_NAMES[i];
      out.push({
        id: 'u' + (i + 1),
        name: name,
        email: EMAIL_LOCAL[name] + '@vallalat.hu',
        initials: initialsOf(name),
        avatar: (i % 4) + 1
      });
    }
    return out;
  }

  // Az allowlistről szándékosan kimaradó felhasználó — a login 403-demója.
  var NOT_ALLOWED_USER = {
    id: 'u99', name: 'Szabó Kata (nincs allowlisten)',
    email: 'kata.szabo@kulsos.hu', initials: 'SK', avatar: 4
  };

  // ---------- kategória-terv: AI-eszköz FAJTÁK ----------
  // A tudásbázis AI-eszközöket őriz, ezért a kategória a dokumentum FAJTÁJA
  // (prompt, skill, rendszerutasítás, sablon, guide, best practice, agent,
  // kiértékelő készlet) — nem témakör. Egyetlen dimenzió, így a térkép
  // klaszterei értelmezhetők: egy klaszter = egy eszközfajta.
  //
  // `weight`  : relatív részesedés a dokumentumokból (0 = sosem kap doksit)
  // `solo`    : pontosan 1 dokumentum — izolált csomópont a térképen
  // `bridge`  : kaphat-e MÁSODIK kategóriaként doksit (a solo/üres nem kaphat,
  //             mert azzal elveszne a demó, amit szemléltet)
  // `template`: ebben a kategóriában MINDEN dokumentum sablon (`isTemplate`)
  var CATEGORY_PLAN = [
    {
      name: 'Promptok', description: 'Újrahasznosítható promptok konkrét feladatokra',
      dir: 'promptok', weight: 9, bridge: true,
      titles: [
        'Ügyfél-email megválaszolása — alap prompt', 'Jegyzőkönyv-összefoglaló prompt',
        'Kódreview prompt — biztonsági fókusz', 'Hibajelentés-osztályozó prompt',
        'Terméktájékoztató szöveg írása', 'SQL-lekérdezés generálása leírásból',
        'Dokumentum-összefoglaló prompt (hosszú kontextus)',
        'Fordítási prompt — magyar-angol szakszöveg',
        'Ügyféli hangnem átírása formálisra', 'Adatkinyerés számlából — strukturált JSON',
        'Tesztadat-generáló prompt', 'Ütemezett riport szöveges kommentárja',
        'Panaszlevél kategorizálása és priorizálása', 'Állásinterjú-kérdések generálása'
      ],
      topics: ['Cél', 'A prompt szövege', 'Változók', 'Példák (few-shot)', 'Ismert korlátok'],
      lines: [
        'A prompt egyetlen feladatra való — összetett kérést bontsd lépésekre.',
        'A változók `{{kapcsos}}` jelöléssel állnak; a behelyettesítés a hívó felelőssége.',
        'A kimenet formátumát a prompt utolsó bekezdése köti meg — ne írd át mérés nélkül.',
        'Két-három few-shot példa érdemben javít; öt fölött már romlik a felidézés.',
        'Hosszú bemenetnél a lényeget a prompt VÉGÉRE tedd — oda figyel jobban a modell.',
        'Ha a modell adatot talál ki, a bizonytalanság kimondását a rendszerutasítás kérje.'
      ]
    },
    {
      name: 'Skillek', description: 'Csomagolt képességek, amiket az asszisztens előhív',
      dir: 'skillek', weight: 8, bridge: true,
      titles: [
        'Számla-feldolgozó skill', 'Ügyfélszolgálati válaszgenerátor skill',
        'Dokumentum-kivonatoló skill', 'Naptár-egyeztető skill',
        'Adatbázis-kérdező skill (csak olvasás)', 'Jelentéskészítő skill',
        'Beszállító-ellenőrző skill', 'Fordító skill — beépített glosszáriummal',
        'Bejelentés-továbbító skill a fejlesztés felé', 'Onboarding-asszisztens skill',
        'Szerződés-kivonatoló skill', 'Költségriport-összeállító skill',
        'E-mail-tisztító skill (idézetek levágása)'
      ],
      topics: ['Mit tud?', 'Mikor induljon el?', 'Bemenet és kimenet', 'Eszközök és jogosultságok', 'Kiértékelés'],
      lines: [
        'A skill LEÍRÁSA dönti el, hogy a modell egyáltalán előhívja-e — ezt írd meg először.',
        'A leírás mondja meg, MIKOR kell használni, ne csak azt, hogy mit tud.',
        'Csak olyan eszközt kap, amire tényleg szükség van; írási jog külön indoklással.',
        'A kimenet sémáját rögzítjük, hogy a hívó oldal ne találgasson.',
        'Minden skillhez tartozik legalább öt kiértékelő eset, köztük két hibás bemenet.',
        'Ha a skill külső szolgáltatást hív, a hibát nem nyeljük el — jelezzük.'
      ]
    },
    {
      name: 'Guide-ok', description: 'Gyakorlati útmutatók a napi AI-használathoz',
      dir: 'guide-ok', weight: 6, bridge: true,
      titles: [
        'Első lépések az asszisztenssel', 'Hogyan írj jó promptot',
        'Modellválasztás: mikor melyiket?', 'Kontextusablak-kezelés hosszú dokumentumoknál',
        'Eszközhívás (tool use) alapjai', 'RAG-beállítás a saját tudásbázisra',
        'Kiértékelés futtatása és olvasása', 'Költségkövetés és tokenszámlálás',
        'Hibakeresés: miért nem hívta meg a skillt?', 'Strukturált kimenet kérése',
        'Több lépéses feladatok bontása'
      ],
      topics: ['Kinek szól?', 'Előfeltételek', 'Lépések', 'Gyakori hibák', 'Hol kérj segítséget?'],
      lines: [
        'Először a legkisebb működő példát rakd össze, utána bővítsd.',
        'A modell nem emlékszik az előző beszélgetésre — a kontextust neked kell átadni.',
        'Ha a válasz elúszik, előbb a promptot egyszerűsítsd, ne a modellt cseréld.',
        'A tokenszám a költség alapja: a hosszú bemenet drága és lassabb is.',
        'Kiértékelés nélkül a „jobb lett" állítás csak érzés.',
        'Kérdés esetén az AI-munkacsoport belső csatornája a legrövidebb út.'
      ]
    },
    {
      name: 'Sablonok', description: 'Kitöltendő vázak új AI-eszközökhöz',
      dir: 'sablonok', weight: 5, bridge: true, template: true,
      titles: [
        'Prompt-sablon — feladatleírás váz', 'Skill-leírás sablon',
        'Rendszerutasítás sablon', 'Kiértékelési terv sablon',
        'AI-használati kérelem sablon', 'Modellváltás — átállási sablon',
        'Incidensjelentés sablon (hibás AI-kimenet)', 'Adatvédelmi hatásvizsgálat sablon',
        'Prompt-változásnapló sablon'
      ],
      topics: ['Mire jó ez a sablon?', 'Kitöltendő részek', 'Példa', 'Ellenőrzőlista'],
      lines: [
        'A szögletes zárójeles részek kitöltendők, a többi maradjon változatlan.',
        'Ha egy szakasz nem értelmezhető, írd be, hogy miért — ne töröld.',
        'A sablonból készült dokumentum új azonosítót és önálló történetet kap.',
        'A kitöltött sablont a felelős hagyja jóvá publikálás előtt.',
        'A sablon maga is verziózott: a belőle készült doksik nem követik automatikusan.'
      ]
    },
    {
      name: 'Best practice-ek', description: 'Bevált elvek, amiket mindenkitől elvárunk',
      dir: 'best-practice', weight: 4, bridge: true,
      titles: [
        'Prompt-verziózás és -mérés', 'Érzékeny adat kezelése modellhívásnál',
        'Emberi jóváhagyás — hol kötelező?', 'Kimenetellenőrzés automatizálása',
        'Hallucináció csökkentése forrásmegjelöléssel', 'Költséghatékony modellhasználat',
        'Prompt-injekció elleni védekezés'
      ],
      topics: ['Az elv', 'Miért?', 'Hogyan alkalmazd?', 'Ellenpélda'],
      lines: [
        'Minden prompt-módosítás mellé tartozik mérés — különben nem tudjuk, javult-e.',
        'Éles ügyféladat nem kerül kísérleti promptba.',
        'Ahol a kimenet pénzt vagy jogot érint, ott ember hagyja jóvá.',
        'A modell kimenetét ADATNAK tekintjük, nem utasításnak.',
        'Forrásmegjelölés nélküli összefoglaló nem publikálható.',
        'A drága modellt csak ott használjuk, ahol mérhetően jobb.'
      ]
    },
    {
      name: 'Rendszerutasítások', description: 'Az asszisztensek viselkedését rögzítő utasítások',
      dir: 'rendszerutasitasok', weight: 3, bridge: true,
      titles: [
        'Alap rendszerutasítás — belső asszisztens',
        'Ügyfélkapcsolati asszisztens rendszerutasítása',
        'Fejlesztői asszisztens rendszerutasítása',
        'Hangnem és stílus — közös szabályblokk',
        'Adatkezelési korlátok — kötelező blokk',
        'Eszkalációs szabályok az asszisztensben'
      ],
      topics: ['Szerep', 'Kötelező viselkedés', 'Tilalmak', 'Eszkaláció', 'Verziózás'],
      lines: [
        'A rendszerutasítás szerepet ad, nem személyiséget — kerüld a jellemrajzot.',
        'Amit tilos, azt kimondjuk: a hallgatásból a modell engedélyt olvas ki.',
        'Bizonytalanság esetén a visszakérdezés az elvárt viselkedés.',
        'Személyes adat nem hagyhatja el a rendszert az utasítás engedélye nélkül.',
        'Minden módosítás új revizió, indoklással — a hatás legyen visszamérhető.',
        'Az utasítás szabályt tartalmaz, konkrét ügyféladatot soha.'
      ]
    },
    {
      name: 'Agent-definíciók', description: 'Több lépéses, önállóan dolgozó folyamatok',
      dir: 'agentek', weight: 1, solo: true, bridge: false,
      titles: ['Jóváhagyási folyamat-agent', 'Riport-összeállító agent', 'Beszerzési asszisztens agent'],
      topics: ['Cél', 'Lépések', 'Korlátok', 'Felügyelet'],
      lines: [
        'Az agent minden külső hívást naplóz.',
        'Írási művelet előtt megerősítést kér.',
        'A lépésszám felső korláttal van megkötve — nem futhat el.',
        'Hiba esetén megáll, nem próbálkozik tovább vaktában.'
      ]
    },
    {
      name: 'Kiértékelő készletek', description: 'Mérőesetek, amikkel a változást ellenőrizzük',
      dir: 'kiertekeles', weight: 1, solo: true, bridge: false,
      titles: ['Ügyfélválasz-kiértékelő készlet', 'Összefoglaló-minőség mérése', 'Regressziós készlet promptváltáshoz'],
      topics: ['Mit mér?', 'Esetek', 'Pontozás', 'Elfogadási küszöb'],
      lines: [
        'A készlet a hibás bemeneteket is tartalmazza, nem csak a szépeket.',
        'A pontozás kritériumai előre rögzítettek.',
        'Küszöb alatt a változás nem mehet élesbe.',
        'Minden esethez tartozik elvárt kimenet vagy elfogadási szabály.'
      ]
    },
    {
      // Szándékosan üres: a facet-lista és a jelmagyarázat viselkedését mutatja
      // olyan kategórián, amely egyetlen csomópontot sem színez.
      name: 'MCP-szerverek', description: 'Még egy dokumentum sem használja — törölhető/átnevezhető',
      dir: 'egyeb', weight: 0, bridge: false, titles: [], topics: [], lines: []
    }
  ];

  // Kategória NÉLKÜLI dokumentumok — a modellben ezek az „Egyéb" gyűjtőbe esnek.
  var UNCATEGORIZED = {
    dir: 'vegyes',
    titles: [
      'Prompt-kísérletek (rendezésre vár)', 'Ötletek — még nincs helye',
      'Konferencia-jegyzetek: LLM-ek a gyakorlatban',
      'Olvasmánylista — modellek és kiértékelés',
      'Vegyes jegyzetek az AI-munkacsoport üléséről',
      'Kísérleti jegyzet — ne hivatkozz rá',
      'Modell-összehasonlítás — nyers jegyzetek',
      'Elnevezési ötletek az asszisztensnek'
    ],
    topics: ['Jegyzetek', 'Nyitott kérdések', 'Következő lépés'],
    lines: [
      'Ez a jegyzet még nem talált kategóriát — rendezésre vár.',
      'A pontokat a következő AI-munkacsoport-ülésen átnézzük.',
      'Ha ebből dokumentum lesz, kategóriát (eszközfajtát) is kap.',
      'Egyelőre gyűjtés, nem döntés.'
    ]
  };

  var SAVE_MESSAGES_FIRST = ['Első vázlat', 'Kezdeti leírás', 'Első verzió', 'Vázlat'];
  var SAVE_MESSAGES_LATER = [
    'Pontosítás a visszajelzések alapján', 'Elírások javítása',
    'Few-shot példák bővítve', 'Átszerkesztett bevezető',
    'Elavult rész törölve', 'Kimeneti formátum szigorítva',
    'Kiértékelés után finomítva', 'Korlátok szakasz hozzáadva'
  ];

  var COMMENT_LINES = [
    'Ehhez a részhez jó lenne egy konkrét példa.',
    'Hosszabb bemeneten ez a prompt elkezd kitalálni adatot — érdemes mérni.',
    'A kimeneti sémát rögzítenéd? Most a hívó oldal találgat.',
    'Van ehhez kiértékelő készlet, vagy csak ránézésre jó?',
    'A változó neve itt más, mint a sablonban — egységesítsük.',
    'Köszi, ez így sokkal érthetőbb lett!',
    'Ezt a szakaszt átvenném a rendszerutasításba is.',
    'Kérdés: ez a drágább modellre is érvényes?',
    'A csapattal átnéztük, részünkről rendben.',
    'Kicsit hosszú — érdemes lenne kettéválasztani.',
    'Az utolsó bekezdés ellentmond a best practice-nek, amit a múlt héten írtunk.',
    'Éles adatot ne tegyünk a példákba, cseréljük műtartalomra.'
  ];

  var ARCHIVE_REASONS = [
    'Modellváltás után nem érvényes', 'Beolvadt egy másik dokumentumba',
    'Kiértékelésen alulmaradt', 'Duplikátum volt',
    'A skill kivezetésre került'
  ];

  // ---------- eloszlás: tervből konkrét darabszámok ----------
  // Legnagyobb maradék elve, `solo` kategóriák fix 1 doksival, minden más
  // nem-üres kategória legalább 2-t kap (egy kategória 2 doksival már látható
  // párt ad a térképen, 1-tel izoláltat — utóbbi legyen szándékos, ne véletlen).
  function planCounts(docCount) {
    var solo = [], weighted = [], i, p;
    for (i = 0; i < CATEGORY_PLAN.length; i++) {
      p = CATEGORY_PLAN[i];
      if (p.weight <= 0) continue;
      if (p.solo) solo.push(p); else weighted.push(p);
    }

    var uncat = Math.max(3, Math.round(docCount * 0.07));
    var rest = docCount - uncat - solo.length;
    var minEach = 2;
    if (rest < weighted.length * minEach) {
      // túl kicsi korpusz a tervhez — a minimumot engedjük el, az arányok maradnak
      minEach = 1;
    }

    var sumW = 0;
    for (i = 0; i < weighted.length; i++) sumW += weighted[i].weight;

    var counts = {}, assigned = 0, fracs = [];
    for (i = 0; i < weighted.length; i++) {
      var raw = rest * weighted[i].weight / sumW;
      var base = Math.max(minEach, Math.floor(raw));
      counts[weighted[i].name] = base;
      assigned += base;
      fracs.push({ name: weighted[i].name, frac: raw - Math.floor(raw), w: weighted[i].weight });
    }
    // maradék kiosztása a legnagyobb törtrész szerint (döntetlennél nagyobb súly nyer)
    fracs.sort(function (a, b) {
      if (b.frac !== a.frac) return b.frac - a.frac;
      if (b.w !== a.w) return b.w - a.w;
      return a.name < b.name ? -1 : 1;
    });
    var leftover = rest - assigned, fi = 0;
    while (leftover > 0 && fracs.length) {
      counts[fracs[fi % fracs.length].name] += 1;
      leftover--; fi++;
    }
    // ha túlléptünk (a minEach padló miatt), a legnagyobbaktól vegyünk vissza
    fi = 0;
    var order = fracs.slice(0).sort(function (a, b) { return counts[b.name] - counts[a.name]; });
    while (leftover < 0 && order.length) {
      var nm = order[fi % order.length].name;
      if (counts[nm] > minEach) { counts[nm] -= 1; leftover++; }
      fi++;
      if (fi > 1000) break;                       // védőkorlát
    }

    for (i = 0; i < solo.length; i++) counts[solo[i].name] = 1;
    return { counts: counts, uncategorized: uncat };
  }

  // ---------- cím a poolból (kifogyás esetén sorszámozott folytatás) ----------
  function titleAt(pool, idx) {
    if (!pool.length) return 'Dokumentum ' + (idx + 1);
    var base = pool[idx % pool.length];
    var round = Math.floor(idx / pool.length);
    return round === 0 ? base : base + ' (' + (round + 1) + '. rész)';
  }

  // ---------- markdown-tartalom ----------
  // A verziók KUMULATÍVAK: a k. verzió az 1..k szekciót tartalmazza. Így a
  // verzió-összehasonlítás valódi, olvasható különbséget mutat.
  function buildSections(rng, plan) {
    var topics = rng.shuffle(plan.topics);
    var count = Math.min(topics.length, rng.between(2, 4));
    var out = [], i, k, lineCount, lines;
    for (i = 0; i < count; i++) {
      lineCount = rng.between(2, 3);
      lines = rng.pickN(plan.lines, Math.min(lineCount, plan.lines.length));
      out.push({ title: topics[i], lines: lines });
    }
    return out;
  }

  function renderContent(title, intro, sections, upTo) {
    var md = '# ' + title + '\n\n' + intro + '\n', i, k;
    for (i = 0; i <= upTo && i < sections.length; i++) {
      md += '\n## ' + sections[i].title + '\n\n';
      for (k = 0; k < sections[i].lines.length; k++) md += '- ' + sections[i].lines[k] + '\n';
    }
    return md;
  }

  var INTROS = [
    'Ez a dokumentum a gyakorlatban bevált változatot rögzíti.',
    'Rövid, működő leírás — ha valami nem stimmel, írj kommentet.',
    'A cél, hogy ezt elolvasva önállóan tudj továbbmenni.',
    'Élő dokumentum: ahogy változik a gyakorlat, itt is frissül.',
    'Ez a leírás a jelenlegi működést tükrözi, nem a kívánatosat.',
    'Használat előtt olvasd el a korlátokat is, ne csak a példát.',
    'Minden módosítást kiértékelés követ — a mérés nélküli finomítás visszaüt.'
  ];

  // ---------- fő generátor ----------
  function generateSeed(options) {
    options = options || {};
    var docCount = Math.max(12, options.docCount || 56);
    var seedNum = typeof options.seed === 'number' ? options.seed : 20260822;
    var now = typeof options.now === 'number' ? options.now : Date.now();
    var rng = makeRng(seedNum);

    var users = buildUsers();
    var allowlist = users.map(function (u) { return u.email; });
    var categories = CATEGORY_PLAN.map(function (p, i) {
      return { id: 'c' + (i + 1), name: p.name, description: p.description };
    });

    var plan = planCounts(docCount);

    // ----- 1. dokumentum-vázak: cím + elsődleges kategória -----
    var drafts = [], pi, p, ti, count;
    for (pi = 0; pi < CATEGORY_PLAN.length; pi++) {
      p = CATEGORY_PLAN[pi];
      count = plan.counts[p.name] || 0;
      for (ti = 0; ti < count; ti++) {
        drafts.push({ title: titleAt(p.titles, ti), plan: p, categories: [p.name] });
      }
    }
    for (ti = 0; ti < plan.uncategorized; ti++) {
      drafts.push({ title: titleAt(UNCATEGORIZED.titles, ti), plan: UNCATEGORIZED, categories: [] });
    }

    // ----- 2. „híd" dokumentumok: második (néha harmadik) kategória -----
    // Ez adja a térképen az összekötött klasztereket és a színátmenetes
    // csomópontokat. A solo és az üres kategória kimarad: azok demója épp az,
    // hogy egyetlen, illetve nulla dokumentumuk van.
    var bridgeNames = CATEGORY_PLAN
      .filter(function (x) { return x.bridge && (plan.counts[x.name] || 0) >= 2; })
      .map(function (x) { return x.name; });

    // A solo kategória doksija se KAPHAT második kategóriát: attól bekötődne a
    // gráfba, és épp az veszne el, amit szemléltet (izolált csomópont).
    var categorized = drafts.filter(function (d) {
      return d.categories.length > 0 && !d.plan.solo;
    });
    var bridgeCount = Math.round(categorized.length * 0.24);
    var bridgePicks = rng.pickN(categorized, bridgeCount), bi, other;
    for (bi = 0; bi < bridgePicks.length; bi++) {
      other = rng.pick(bridgeNames);
      if (bridgePicks[bi].categories.indexOf(other) >= 0) continue;
      bridgePicks[bi].categories.push(other);
      if (rng.chance(0.2)) {
        var third = rng.pick(bridgeNames);
        if (bridgePicks[bi].categories.indexOf(third) < 0) bridgePicks[bi].categories.push(third);
      }
    }

    // ----- 3. részletek: szerzők, verziók, státusz, dátumok -----
    // A dokumentumok sorrendjét megkeverjük, hogy a lista ne kategória-blokkokban
    // jöjjön — a keverés is determinisztikus.
    drafts = rng.shuffle(drafts);

    var docs = [], comments = [], events = [], di, d, i, k;
    var favorites = {};
    for (i = 0; i < users.length; i++) favorites[users[i].id] = [];

    // Legalább ennyi doksi frissüljön 12 óron belül, hogy a „Ma" szűrő fogjon.
    var freshQuota = 3;

    for (di = 0; di < drafts.length; di++) {
      d = drafts[di];
      var docId = 'd' + (di + 1);

      // --- szerzők: owner + 0..3 további közreműködő (coauthor-változatosság) ---
      var owner = rng.pick(users);
      var coauthorCount = rng.weighted([
        { v: 0, w: 4 },     // egyszerzős doksi
        { v: 1, w: 5 },
        { v: 2, w: 3 },
        { v: 3, w: 2 }
      ]);
      var others = rng.pickN(users.filter(function (u) { return u.id !== owner.id; }), coauthorCount);
      var authorPool = [owner].concat(others);

      // --- verziók ---
      var versionCount = Math.max(authorPool.length, rng.weighted([
        { v: 1, w: 3 }, { v: 2, w: 5 }, { v: 3, w: 4 }, { v: 4, w: 3 }, { v: 5, w: 2 }, { v: 6, w: 1 }
      ]));

      var sections = buildSections(rng, d.plan);
      var intro = rng.pick(INTROS);

      // Időrend: a legrégebbi verzió 20..400 nappal ezelőtt, a legfrissebb
      // `headAge`-kor; a köztes verziók egyenletesen elosztva, kis szórással.
      var firstAge = rng.between(20, 400) * DAY;
      var headAge;
      if (freshQuota > 0 && rng.chance(0.5)) {
        headAge = rng.between(1, 11) * HOUR;                   // „Ma" szűrő találata
        freshQuota--;
      } else {
        headAge = rng.between(2, 120) * DAY;
      }
      if (headAge >= firstAge) headAge = Math.round(firstAge / 2);

      var versions = [];
      for (k = 0; k < versionCount; k++) {
        var t = versionCount === 1 ? 1 : k / (versionCount - 1);
        var age = Math.round(firstAge + (headAge - firstAge) * t);
        // a szerző körbejár az author-poolban → az `authorIds` valóban több szerzős
        var author = authorPool[k % authorPool.length];
        var msg = k === 0
          ? rng.pick(SAVE_MESSAGES_FIRST)
          : (rng.chance(0.55) && sections[k]
              ? '„' + sections[k].title + '" szekció hozzáadva'
              : rng.pick(SAVE_MESSAGES_LATER));
        versions.push({
          ts: now - age,
          authorId: author.id,
          message: msg,
          content: renderContent(d.title, intro, sections, k)
        });
      }
      versions.sort(function (a, b) { return a.ts - b.ts; });
      // A revizió-sorszám a RENDEZÉS UTÁN kerül rá, így garantáltan időrendi:
      // r1 a legrégebbi, a legnagyobb sorszám a jelenlegi verzió.
      for (k = 0; k < versions.length; k++) versions[k].rev = k + 1;

      // --- státusz, sablon, archiválás ---
      // A sablon-jelleg a KATEGÓRIÁBÓL jön (`template: true`), nem érmefeldobásból:
      // a Sablonok minden tagja sablon. Emellett a promptok és rendszerutasítások
      // egy kis része paraméterezett váz, ezért az is sablonnak számít — így a
      // „Sablon" facet nem pontosan ugyanazt adja, mint a Sablonok kategória.
      // (Korábban 8% véletlen doksi kapott sablon-jelleget, és a címéhez
      // hozzáfűztük a „sablon" szót — ebből jöttek a „Kódreview folyamat sablon"
      // típusú elnevezések.)
      var status = rng.weighted(STATUS_WEIGHTS);
      var isTemplate = !!d.plan.template || (d.plan.bridge && rng.chance(0.06));
      if (isTemplate) status = 'publikált';                    // sablon nem marad vázlatban
      var archived = rng.chance(0.05);
      var deletedAt = archived ? now - rng.between(1, 30) * DAY : null;

      var dirName = d.plan.dir || 'vegyes';
      docs.push({
        id: docId,
        repoPath: dirName + '/' + slug(d.title) + '.md',
        title: d.title,
        status: status,
        ownerId: owner.id,
        iteration: versions.length,
        categories: d.categories.slice(0),
        isTemplate: isTemplate,
        deletedAt: deletedAt,
        versions: versions
      });

      // --- események: a verziókból és a státuszból következnek ---
      events.push({
        id: 'e-' + docId + '-0', docId: docId, type: 'created',
        userId: versions[0].authorId, ts: versions[0].ts, details: {}
      });
      for (k = 1; k < versions.length; k++) {
        events.push({
          id: 'e-' + docId + '-' + k, docId: docId, type: 'edited',
          userId: versions[k].authorId, ts: versions[k].ts,
          details: { rev: versions[k].rev }
        });
      }
      if (status !== 'draft') {
        var prevStatus = STATUSES[Math.max(0, STATUSES.indexOf(status) - 1)];
        events.push({
          id: 'e-' + docId + '-s', docId: docId, type: 'status_changed',
          userId: owner.id, ts: versions[versions.length - 1].ts + HOUR,
          details: { from: prevStatus, to: status }
        });
      }
      if (deletedAt) {
        events.push({
          id: 'e-' + docId + '-x', docId: docId, type: 'deleted',
          userId: owner.id, ts: deletedAt, details: { reason: rng.pick(ARCHIVE_REASONS) }
        });
      }

      // --- kommentek: a doksik kb. harmadán, 1..3 db ---
      if (rng.chance(0.34)) {
        var cCount = rng.between(1, 3);
        for (k = 0; k < cCount; k++) {
          var cAuthor = rng.pick(users);
          var cTs = versions[versions.length - 1].ts - rng.between(1, 20) * HOUR;
          var cId = 'k-' + docId + '-' + k;
          var edited = rng.chance(0.15);
          var cDeleted = rng.chance(0.08);
          comments.push({
            id: cId, docId: docId, authorId: cAuthor.id, ts: cTs,
            content: rng.pick(COMMENT_LINES),
            editedAt: edited ? cTs + 2 * HOUR : null,
            deletedAt: cDeleted ? cTs + HOUR : null
          });
          if (edited) {
            events.push({
              id: 'e-' + cId + '-ce', docId: docId, type: 'comment_edited',
              userId: cAuthor.id, ts: cTs + 2 * HOUR, details: { previous: 'Korábbi megjegyzés.' }
            });
          }
          if (cDeleted) {
            events.push({
              id: 'e-' + cId + '-cd', docId: docId, type: 'comment_deleted',
              userId: cAuthor.id, ts: cTs + HOUR, details: {}
            });
          }
        }
      }

      // --- kedvencek: privát, felhasználónként ---
      if (!deletedAt && rng.chance(0.12)) {
        var favUser = rng.pick(users);
        if (favorites[favUser.id].indexOf(docId) < 0) favorites[favUser.id].push(docId);
      }
    }

    events.sort(function (a, b) { return a.ts - b.ts; });
    comments.sort(function (a, b) { return a.ts - b.ts; });

    return {
      users: users,
      allowlist: allowlist,
      notAllowedUser: NOT_ALLOWED_USER,
      categories: categories,
      docs: docs,
      comments: comments,
      events: events,
      favorites: favorites,
      meta: { seed: seedNum, docCount: docs.length, categoryCounts: plan.counts }
    };
  }

  global.generateSeed = generateSeed;
})(window);
