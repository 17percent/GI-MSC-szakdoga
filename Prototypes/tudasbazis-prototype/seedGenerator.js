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

  // ---------- kategória-terv ----------
  // `weight`  : relatív részesedés a dokumentumokból (0 = sosem kap doksit)
  // `solo`    : pontosan 1 dokumentum — izolált csomópont a térképen
  // `bridge`  : kaphat-e MÁSODIK kategóriaként doksit (a solo/üres nem kaphat,
  //             mert azzal elveszne a demó, amit szemléltet)
  var CATEGORY_PLAN = [
    {
      name: 'Folyamatok', description: 'Belső folyamatleírások', dir: 'folyamatok',
      weight: 9, bridge: true,
      titles: [
        'Döntési jegyzőkönyv sablon', 'Incidenskezelési folyamat',
        'Változáskezelés — jóváhagyási lánc', 'Kódreview folyamat',
        'Beszerzési kérelem útja', 'Projektindítás — checklist',
        'Kilépési folyamat (offboarding)', 'Heti státuszriport — mit tartalmazzon',
        'Eszkalációs szintek és felelősök', 'Dokumentum-életciklus: vázlattól a publikálásig',
        'Belső auditra való felkészülés', 'Szerződés-jóváhagyás lépései'
      ],
      topics: ['Mikor indul a folyamat?', 'Szereplők és felelősségek', 'Lépések', 'Határidők', 'Kivételek'],
      lines: [
        'A folyamat a kérelem beérkezésével indul, a rögzítés a belső portálon történik.',
        'A jóváhagyást a közvetlen vezető adja meg, hiányában a helyettese.',
        'Minden lépés nyomot hagy az eseménynaplóban — utólag visszakövethető.',
        'Két munkanapon belül visszajelzést kell adni a kérelmezőnek.',
        'Sürgős esetben a folyamat rövidíthető, de a jóváhagyás nem hagyható ki.',
        'A lezárás után a dokumentumot publikált státuszba kell állítani.'
      ]
    },
    {
      name: 'DevOps', description: 'Üzemeltetés, CI/CD, infrastruktúra', dir: 'devops',
      weight: 8, bridge: true,
      titles: [
        'Deploy folyamat — staging és éles', 'Runbook sablon', 'CI pipeline felépítése',
        'Kubernetes klaszter — üzemeltetési tudnivalók',
        'Titkos kulcsok és környezeti változók kezelése', 'Monitorozás és riasztások',
        'Mentés és visszaállítás', 'Terraform modulok — konvenciók',
        'Log-gyűjtés és -megőrzés', 'Verziócímkézés és release-kezelés',
        'Terheléses teszt a staging környezeten'
      ],
      topics: ['Áttekintés', 'Staging', 'Éles környezet', 'Riasztások', 'Rollback'],
      lines: [
        'A CI a `develop` branchre érkező merge után automatikusan buildel és deployol.',
        'Éles deployhoz release tag kell (`v1.2.3` formátum) és jóváhagyás a release csatornán.',
        'Pénteken munkaidőben nem deployolunk — hotfix kivétel, de jóváhagyással.',
        'A titkos kulcsok kizárólag a secret store-ból jönnek, repóba nem kerülnek.',
        'Hiba esetén az előző tag újra-deployolható; az adatbázis-migráció visszavonása külön runbook.',
        'A riasztás akkor jó, ha van mögötte teendő — egyébként zaj, és ki kell kapcsolni.'
      ]
    },
    {
      name: 'Backend', description: 'Szerveroldali fejlesztés', dir: 'backend',
      weight: 7, bridge: true,
      titles: [
        'Backend kódolási konvenciók', 'REST API tervezési irányelvek',
        'Hibakezelés és hibaformátum', 'Aszinkron feldolgozás — queue-minták',
        'Naplózás: mit, mikor, milyen szinten', 'Autentikáció és tokenkezelés',
        'Migrációk írása és visszavonása', 'Gyorsítótárazási stratégia',
        'Háttérfeladatok ütemezése', 'Külső integrációk hibatűrése'
      ],
      topics: ['Elnevezések', 'Hibakezelés', 'Naplózás', 'Tesztelhetőség', 'Teljesítmény'],
      lines: [
        'Szolgáltatás-osztályok neve `XyzService`, az aszinkron függvények igével kezdődnek.',
        'Minden végpont egységes hibaformátumot ad vissza; nyelt kivétel (üres `catch`) tilos.',
        'A naplóba strukturált objektum kerül, nem összefűzött szöveg.',
        'Külső hívás körül időkorlát és újrapróbálkozás kell, exponenciális várakozással.',
        'A queue-ra tett feladatnak idempotensnek kell lennie — kétszer is lefuthat.',
        'A migráció legyen visszavonható, vagy legyen leírva, miért nem az.'
      ]
    },
    {
      name: 'Frontend', description: 'Kliensoldali fejlesztés', dir: 'frontend',
      weight: 5, bridge: true,
      titles: [
        'Frontend komponens-katalógus', 'Akadálymentesség — minimumkövetelmények',
        'Állapotkezelés a kliensen', 'Design tokenek használata a kódban',
        'Űrlapok és validáció', 'Reszponzív breakpointok',
        'Betöltési és üres állapotok', 'Ikonok és illusztrációk kezelése'
      ],
      topics: ['Gombok', 'Űrlapok', 'Színek és tokenek', 'Fókusz és billentyűzet', 'Állapotok'],
      lines: [
        'Elsődleges akció kitöltött gomb, másodlagos körvonalas, veszélyes művelet megerősítéssel.',
        'Minden mező alatt fenn van tartva a hibaüzenet helye, hogy a layout ne ugráljon.',
        'Nyers hex és px nem kerül komponens-CSS-be — minden érték tokenből jön.',
        'Minden interaktív elemen látható fókuszjelzés kell, egérrel is használható marad.',
        'A jelentést sosem csak szín hordozza: ikon vagy felirat kíséri.',
        'Üres állapotban is mondjuk meg, mi a következő lépés — ne csak azt, hogy nincs adat.'
      ]
    },
    {
      name: 'HR', description: 'Munkaügyi tudnivalók', dir: 'hr',
      weight: 5, bridge: true,
      titles: [
        'Szabadság igénylése', 'Home office szabályzat', 'Béren kívüli juttatások',
        'Teljesítményértékelés menete', 'Betegszabadság és táppénz',
        'Belső képzések és konferenciák', 'Munkaidő-nyilvántartás', 'Ajánlási program'
      ],
      topics: ['Kinek szól?', 'Igénylés', 'Határidők', 'Jóváhagyás', 'Gyakori kérdések'],
      lines: [
        'Az igénylés a HR-portálon indul, papíralapú kérelmet nem fogadunk.',
        '1–2 nap esetén legalább 3 munkanappal, egy hétnél hosszabb esetén 2 héttel előre.',
        'A jóváhagyást a közvetlen vezető adja meg a portálon.',
        'Betegség esetén a jelzés aznap reggel esedékes, az igazolás utólag töltendő fel.',
        'A juttatási keret naptári évre szól, a fel nem használt rész nem vihető át.',
        'Kérdés esetén a HR-kapcsolattartó a belső címtárban megtalálható.'
      ]
    },
    {
      name: 'Onboarding', description: 'Új belépők anyagai', dir: 'onboarding',
      weight: 4, bridge: true,
      titles: [
        'Első hét — új belépő checklist', 'Fejlesztői környezet beállítása',
        'Kihez fordulj? — kapcsolattartók', 'Céges eszközök átvétele',
        'Belső rendszerek és hozzáférések', 'Mentorprogram — mentoroknak',
        'Első hónap célkitűzései'
      ],
      topics: ['Első nap', 'Első hét', 'Hozzáférések', 'Mentorprogram', 'Hasznos linkek'],
      lines: [
        'Laptop és jogosultságok átvétele az IT-tól, céges e-mail beállítása.',
        'VPN kliens telepítése a belső wikiből, kétfaktoros hitelesítés bekapcsolása.',
        'Bemutatkozó kör a csapatban — a mentor segít az első körben.',
        'Minden új belépő mellé mentort rendelünk az első hónapra.',
        'A fejlesztői környezet felállítása után futtasd le a teszteket — ez az első zöld pipa.',
        'Ha valami nem világos, kérdezz az első héten — később drágább.'
      ]
    },
    {
      name: 'Tesztelés', description: 'Tesztelési gyakorlat és eszközök', dir: 'teszteles',
      weight: 4, bridge: true,
      titles: [
        'Tesztpiramis — mit hol tesztelünk', 'Manuális tesztforgatókönyvek',
        'E2E tesztek karbantartása', 'Hibajelentés — mit írjunk bele',
        'Tesztadatok előállítása', 'Regressziós körök a release előtt',
        'Teljesítménytesztek kiértékelése'
      ],
      topics: ['Mit tesztelünk?', 'Eszközök', 'Tesztadatok', 'Hibajelentés', 'Release előtt'],
      lines: [
        'A gyors, sok egységteszt alá tesszük a lassú, kevés végponti tesztet.',
        'Az E2E teszt akkor ér valamit, ha stabil — a villogó tesztet javítjuk vagy töröljük.',
        'A hibajelentés tartalmazza a lépéseket, az elvárt és a tapasztalt viselkedést.',
        'Tesztadat sosem éles adat — a generált korpusz erre való.',
        'Release előtt a regressziós kör kötelező, a kihagyást indokolni kell.',
        'A teljesítménytesztet mindig ugyanazon a környezeten futtatjuk, különben nem összevethető.'
      ]
    },
    {
      name: 'Biztonság', description: 'Információbiztonság és adatvédelem', dir: 'biztonsag',
      weight: 3, bridge: true,
      titles: [
        'Jelszókezelés és jelszótár', 'Adatvédelmi incidens — első 24 óra',
        'Jogosultságok felülvizsgálata', 'Phishing — mit tegyél, ha kaptál',
        'Titkosítás nyugalmi és átvitt adaton', 'Sérülékenység-bejelentés kezelése'
      ],
      topics: ['Alapszabályok', 'Bejelentés', 'Első 24 óra', 'Felülvizsgálat', 'Képzés'],
      lines: [
        'Jelszó kizárólag jelszókezelőben tárolható, megosztott fiók nem használható.',
        'Gyanús levelet ne továbbíts — jelentsd a biztonsági csatornán.',
        'Incidens esetén az első lépés a hatókör megállapítása, nem a javítás.',
        'A jogosultságokat negyedévente átnézzük, a felesleges hozzáférést visszavonjuk.',
        'Éles adatot fejlesztői környezetbe másolni tilos.',
        'A bejelentőt nem érheti hátrány — a hibát megköszönjük.'
      ]
    },
    {
      name: 'Adatbázis', description: 'Adatmodell, lekérdezések, üzemeltetés', dir: 'adatbazis',
      weight: 3, bridge: true,
      titles: [
        'Séma-konvenciók', 'Indexelési irányelvek', 'Lassú query-k felderítése',
        'Adatmegőrzési és archiválási szabályok', 'Kapcsolatkezelés és pool-méretezés',
        'Riportlekérdezések elkülönítése'
      ],
      topics: ['Elnevezések', 'Indexek', 'Lekérdezések', 'Archiválás', 'Monitorozás'],
      lines: [
        'A táblanevek többes számban, a mezők `snake_case` formában állnak.',
        'Index csak mért igény alapján kerül fel — a nem használt index is költség.',
        'A lassú lekérdezéseket a napló alapján hetente átnézzük.',
        'Az archiválás nem törlés: az adat elérhető marad, csak külön táblában.',
        'A riportlekérdezések olvasó replikán futnak, nem az elsődlegesen.',
        'Minden migráció előtt mentés készül, a visszaállítást ki is próbáljuk.'
      ]
    },
    {
      name: 'Ügyfélszolgálat', description: 'Bejelentések fogadása és kezelése', dir: 'ugyfelszolgalat',
      weight: 2, bridge: true,
      titles: [
        'Hibabejelentés fogadása', 'Válasz-sablonok gyakori kérdésekre',
        'Eszkaláció a fejlesztés felé', 'SLA-szintek és határidők',
        'Ügyfél-visszajelzések gyűjtése'
      ],
      topics: ['Bejelentés felvétele', 'Osztályozás', 'Eszkaláció', 'Válaszadás', 'Zárás'],
      lines: [
        'A bejelentéshez rögzítjük a hatókört: egy ügyfelet érint vagy többet?',
        'Az első válasz határideje SLA-szinttől függ, de sosem több egy munkanapnál.',
        'Eszkalálás előtt gyűjtsük össze a reprodukciós lépéseket.',
        'A sablonválaszt mindig szabjuk az ügyfél kérdésére — vakon ne küldjük ki.',
        'Zárás előtt kérdezzünk vissza, hogy a megoldás valóban megfelel-e.',
        'A visszatérő kérdésekből dokumentum lesz, nem újabb sablon.'
      ]
    },
    {
      name: 'Pénzügy', description: 'Elszámolás, számlázás, büdzsé', dir: 'penzugy',
      weight: 1, solo: true, bridge: false,
      titles: ['Költségtérítés elszámolása', 'Számlázási alapfogalmak', 'Éves büdzsé tervezése'],
      topics: ['Mit lehet elszámolni?', 'Beadás', 'Határidők', 'Kifizetés'],
      lines: [
        'Az elszámoláshoz eredeti bizonylat kell, a fotó csak a beadáshoz elég.',
        'A hónap 5. napjáig beadott elszámolás a következő bérrel érkezik.',
        'Kérdéses tétel esetén előre egyeztess, ne utólag.',
        'A keretet meghaladó tétel külön jóváhagyást igényel.'
      ]
    },
    {
      name: 'Jog és megfelelés', description: 'Szerződések, szabályozói megfelelés', dir: 'jog',
      weight: 1, solo: true, bridge: false,
      titles: [
        'Adatkezelési tájékoztató — belső változat', 'Alvállalkozói szerződések alapjai',
        'Szerzői jog a dokumentációban'
      ],
      topics: ['Mire figyeljünk?', 'Jóváhagyás', 'Megőrzés', 'Kapcsolat'],
      lines: [
        'Szerződést csak az arra felhatalmazott személy írhat alá.',
        'A jogi véleményezés legalább 5 munkanapot igényel.',
        'Külső féllel megosztott dokumentum előtt titoktartási megállapodás kell.',
        'A megőrzési idő lejárta után a dokumentum archiválható.'
      ]
    },
    {
      // Szándékosan üres: a facet-lista és a jelmagyarázat viselkedését mutatja
      // olyan kategórián, amely egyetlen csomópontot sem színez.
      name: 'Üres kategória', description: 'Még egy dokumentum sem használja — törölhető/átnevezhető',
      dir: 'egyeb', weight: 0, bridge: false, titles: [], topics: [], lines: []
    }
  ];

  // Kategória NÉLKÜLI dokumentumok — a modellben ezek az „Egyéb" gyűjtőbe esnek.
  var UNCATEGORIZED = {
    dir: 'vegyes',
    titles: [
      'Ötletek — még nincs helye', 'Kávégép használati útmutató',
      'Csapatépítő — helyszínjavaslatok', 'Vegyes jegyzetek a hétfői megbeszélésről',
      'Konferencia-jegyzetek (rendezésre vár)', 'Elnevezési ötletek a új modulhoz',
      'Olvasmánylista', 'Kísérleti jegyzet — ne hivatkozz rá'
    ],
    topics: ['Jegyzetek', 'Nyitott kérdések', 'Következő lépés'],
    lines: [
      'Ez a jegyzet még nem talált kategóriát — rendezésre vár.',
      'A pontokat a következő megbeszélésen átnézzük.',
      'Ha ebből dokumentum lesz, kategóriát is kap.',
      'Egyelőre gyűjtés, nem döntés.'
    ]
  };

  var SAVE_MESSAGES_FIRST = ['Első vázlat', 'Kezdeti leírás', 'Első verzió', 'Vázlat'];
  var SAVE_MESSAGES_LATER = [
    'Pontosítás a visszajelzések alapján', 'Elírások javítása', 'Példa hozzáadva',
    'Átszerkesztett bevezető', 'Elavult rész törölve', 'Hivatkozások frissítve'
  ];

  var COMMENT_LINES = [
    'Ehhez a részhez jó lenne egy konkrét példa.',
    'A hivatkozott portál címe megváltozott, frissítsük.',
    'Szerintem ez a lépés kihagyható, ha már van jóváhagyás.',
    'Van erre valahol egy ábra? Sokat segítene.',
    'A határidő itt 3 vagy 5 munkanap? A másik doksi mást ír.',
    'Köszi, ez így sokkal érthetőbb lett!',
    'Ezt a szakaszt átvenném a sablonba is.',
    'Kérdés: ez az éles környezetre is vonatkozik?',
    'A csapattal átnéztük, részünkről rendben.',
    'Kicsit hosszú — érdemes lenne kettéválasztani.'
  ];

  var ARCHIVE_REASONS = [
    'Elavult a szerverköltözés óta', 'Beolvadt egy másik dokumentumba',
    'A folyamat megszűnt', 'Duplikátum volt'
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
    'Ez a dokumentum a téma gyakorlati tudnivalóit gyűjti össze.',
    'Rövid, működő leírás — ha valami nem stimmel, írj kommentet.',
    'A cél, hogy ezt elolvasva önállóan tudj továbbmenni.',
    'Élő dokumentum: ahogy változik a gyakorlat, itt is frissül.',
    'Ez a leírás a jelenlegi működést tükrözi, nem a kívánatosat.'
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
      var status = rng.weighted(STATUS_WEIGHTS);
      var isTemplate = rng.chance(0.08);
      if (isTemplate) status = 'publikált';                    // sablon nem marad vázlatban
      var archived = rng.chance(0.05);
      var deletedAt = archived ? now - rng.between(1, 30) * DAY : null;

      var dirName = d.plan.dir || 'vegyes';
      docs.push({
        id: docId,
        repoPath: dirName + '/' + slug(d.title) + '.md',
        title: isTemplate && !/sablon/i.test(d.title) ? d.title + ' sablon' : d.title,
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
