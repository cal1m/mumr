# DnD v mixed reality: návrh a postup implementace

Dokument popisuje, co chceme vytvořit, jak to chceme udělat a v jakém stavu to je. Je to pracovní dokument: podle odpovědí
zadavatele se upravuje. Otevřené otázky jsou v [sekci 11](#11-otevřené-otázky).

## 1. Co chceme vytvořit

Hra v duchu Dungeons & Dragons, kde se hráči nedívají na obrazovku, ale hrají na **skutečné podlaze** v místnosti. Do prostoru
se promítají postavy a předměty ve skutečné velikosti. Hráči jsou sami sebou: **nejsou tu žádné figurky**, hra se účastní
reální lidé. Cílem je **autenticita zážitku**, kterou papír na stole nedá: drak se otáčí za pohybem, dech dopadne na podlahu
a hráč cítí důsledky svého rozhodnutí.

Hráči nosí headsety (zatím dva Meta Quest 3 a jeden další, značku zatím neřešíme). Vidí:

- **postavy**, hlavně draka a další bytosti ovládané AI, které reagují na hráče,
- **předměty**, které lze chytit rukou (meč, lektvar, svitek) a předat je,
- **důsledky**: zranění, stav postavy a hlas vypravěče, který komentuje, co se stalo.

Hody kostkou provádí **počítač za hráče**. Hráči nevidí, jak kostka dopadla, ale zažívají **důsledek**, který vypravěč okomentuje
(např. „drak tě zasáhne a tvůj štít praskne“). Hra běží s hlasy a zvukovými efekty.

Cílová představa zážitku (scénář):

> Čtyři hráči stojí v obývacím pokoji na podlaze, 3 × 4 m. Uprostřed je drak ve skutečné velikosti a otáčí hlavu za nejbližším
> hráčem. Hráč A chytí meč, který je vidět až ve chvíli, kdy ho drží. Drak vydechne a dech dopadne na podlahu mezi hráči.
> Hráč B musí uskočit za virtuální zeď; počítač hodí za něj a vypravěč hlasem řekne, že se popálil jen okraj pláště.
> Drak si zapamatuje, kdo ho zasáhl, a příště se vrhne na něj.

## 2. Co máme: engine MUMR

Základ je projekt **MUMR** (multi-user mixed reality) v tomto repozitáři. Dává hotové věci:

| Co MUMR dává | K čemu to použijeme v DnD |
|---|---|
| Sdílený **dokument** (události v pořadí, server drží nejnovější stav) | postavy, HP, předměty, iniciativa, stav kampaně |
| **Tělesa** (věci, které se hýbou a dají se chytit) | předměty na podlaze, případně další věci ve scéně |
| **Přítomnost** (hlava a ruce každého hráče) | hráči vidí, kde jsou ostatní, a mohou se dotknout draka |
| **Společné souřadnice** (zarovnání podle dvou křížů na podlaze) | drak a předměty stojí na stejném místě pro všechny |
| **Host** (`host.js`) na PC | AI draka, kostky, vyhodnocení; nesmí to počítat headset |
| **Log** (`mumr-server.log`) | ladění bez toho, aby hráči museli cokoli hlásit |

Omezení, které je potřeba řešit: engine je dnes testovaný pro **2 až 4 hráče**. Zadání chce **2 až 5**, viz
[sekce 11](#11-otevřené-otázky), otázka 2. Hub už má parametr `max_peers` (výchozí 4); páté místo je tedy hlavně konfigurace
a test, ne přepis. Zatím žádná VR část v MUMR neběžela na headsetu.

## 3. Mapování DnD na druhy sdílených věcí

| Herní věc | Druh v MUMR | Kdo ji mění | Poznámka |
|---|---|---|---|
| Postava hráče (jméno, HP, maximum) | dokument, **vlastněná** (`own`) | jen stránka, která ji vytvořila | trvalá kampaň: postava zůstává mezi hrami (sekce 6) |
| Předmět (meč, lektvar) | dokument, sdílená; zároveň **těleso**, když ho někdo drží | kdokoli (chytit, předat, položit) | fáze 2 |
| Drak a další bytosti AI | **těleso** řízené hostem | host na PC; hráči ho zasahují rukou | host drží bytosti, kterých se nikdo nedotýká |
| Paměť AI (kdo koho zranil, kdo je nepřítel) | dokument, zapisuje host | host | základ „rozvíjení“ AI (sekce 4) |
| Iniciativa a kola | dokument | host | ukládá se, aby se souboj dal obnovit |
| Hod kostkou | událost dokumentu | **host** | hráč nevidí výsledek, dostane jen důsledek a komentář |
| Hlas vypravěče a zvuky | lokální zvuk na každém headsetu | host posílá, které replika se má přehrát | zvuk jen zvuk; neměnit stav světa |

Klíčové pravidlo: **náhodu, výsledky a důsledky počítá host.** Dnes (fáze 1) jsou kostky na stránce, to přesuneme na host dřív,
než se hraje s více lidmi.

## 4. AI draka a dalších bytostí

„Primitivní AI, která se rozvíjí“ podle chování hráčů je technicky dobře řešitelná **bez velkého jazykového modelu**:

- **Stavový automat / utility AI:** každá bytost má cíle (chránit hnízdo, lovit nejslabšího, vyhnout se světlu) a vybírá akci
  podle skóre. Skóre se počítá z vidění, vzdálenosti a paměti.
- **Paměť vztahů:** host si pro každého hráče drží „hrozbu“, „strach“ a „úctu“. Když hráč drak zasáhne, hrozba roste a příště
  se drak k němu přiblíží nebo naopak ustoupí. Tato data jsou v dokumentu, takže přežijí restart.
- **Vývoj v čase:** drak se během hry učí a odemyká nové útoky (např. po třech zraněních jednou stranou ho to naučí otočit se).
  Je to jen pravidlová tabulka, žádná neuronová síť.
- **Hlas a dialog (volitelně):** hotové repliky nebo generované texty. Generování jazykovým modelem je možné, ale přidá
  závislost na internetu, cenu a latenci; rozhodnuto: bez jazykového modelu (sekce 11).

## 5. Scénáře a kampaň

- **One-shot dobrodružství:** 2 až 3 hodiny, jeden scénář, na konci konec. První cíl.
- **Kampaň s uložením:** postavy, předměty a stav světa se ukládají na PC (dokument a stav hosta). Další hra navazuje.
- **Scénář, který část píšou hráči:** hráči ovlivní děj svými rozhodnutími; host řídí větve podle „stavových“ proměnných
  (např. kdo zabil koho, co hráči našli). Autor scénáře připraví kostru a větve, hráči vyplní detaily během hry.

## 6. Pravidla (pracovní verze, inspirována D&D, vlastní obsah)

Cíl: pravidla, která podporují **důsledky a napětí**, ne přesné počítání. Počítač hází, hráči prožívají výsledky.

- **Postava:** jméno, HP, obrana, jeden až dva útoky, jedna schopnost (volitelně).
- **Test:** host hodí d20 + bonus proti obraně nebo obtížnosti. Hráč nevidí číslo, jen výsledek a vypravěčův komentář.
- **Kolo:** iniciativa, pak tahy bytostí a hráčů; hráč na tahu volí akci (útok, pohyb, předmět).
- **Drak:** HP, obrana, útok drápy, dech (test záchrany pro všechny v kuželu), paměť hrozeb.
- **Předměty:** meč, lektvar, svitek; každý má jednoduchý efekt a stav držení.
- **Licence:** obsah píšeme sami (vlastní bytosti, předměty, texty). Pravidla jsou vlastní nebo založená na obecně volném
  zdroji. Nepoužíváme jména, texty ani bytosti z D&D nebo SRD (sekce 11).

## 7. Prostor a místnost

- **Začátek:** hrací plocha 3 × 4 m, nastavená **ručně** (hráči ukážou rohy na podlaze, jako dnes křížem v MUMR).
- **Později:** mapování jiné místnosti. Quest umí detekovat roviny a případně scénu; ověříme, co prohlížeč na Questu nabízí
  (WebXR `plane-detection`, `mesh-detection`). Do té doby se rohy zadávají ručně.
- **Skutečná velikost:** drak a další bytosti jsou v metrech podle reality; měřítko se ladí ve fázi 3.

## 8. Zvuk

- **Hlasy:** vypravěč a bytosti. Lokální TTS na PC, předem vygenerované (sekce 11).
- **Zvukové efekty:** hod kostkou, dech, kroky, zásah, předmět chycen. Zdroj: vlastní nahrávky nebo volné knihovny s jasnou licencí.
- **Prostorový zvuk:** zvuk přichází z místa, kde je zdroj. Quest to umí přes WebAudio (panner). Podrobnosti ve fázi 6.

## 9. Postup implementace (fáze)

Každá fáze je samostatně použitelná a dá se ověřit.

**Fáze 0: seznámení (hotovo).** `counter`, `cube`, `docs/HOWTO-NEW-APP.md`, `docs/ARCHITECTURE.md`.

**Fáze 1: prototyp na PC bez VR (hotovo, commit `2331d1b` na větvi `add-dnd-example`).** Postavy s HP, sdílené předměty,
hody d20 a d6, log hodů. Ověřeno ve dvou kartách prohlížeče. *Pozor:* kostky zatím hází stránka; přejde na host.

**Fáze 2: předměty jako tělesa.** Meč a lektvar jako `Body` s tokenem. Chytit, předat, položit. Zatím ve dvou kartách
(myš jako prst, jako v `examples/cube`). *Hotovo, až:* předmět se u všech pohybuje stejně a při odpojení držitele se uvolní.

**Fáze 3: drak v místnosti (první VR krok).** glTF model draka v `Space`, ve skutečné velikosti. AI běží v `host.js`:
otáčí se za nejbližším hráčem a vybírá jednoduché akce. Hráči ho vidí a mohou se ho dotknout rukou.
*Hotovo, až:* drak stojí na stejném místě na všech headsetech a dotyk ruky je vidět všem.

**Fáze 4: kostky na hostu a boj.** Všechny hody počítá `host.js`, hráči dostávají jen důsledek a komentář. Iniciativa,
kola, útoky a zranění. Paměť hrozeb draka. *Hotovo, až:* celý souboj jde dohrát a nová stránka uprostřed souboje vidí správný stav.

**Fáze 5: hlasy a zvuky.** Vypravěč (hlas), zvukové efekty, přehrávání na správném místě. *Hotovo, až:* vypravěč říká
důsledky a zvuk je slyšet ze správného směru.

**Fáze 6: test na headsetech a rozšíření.** Dva Questy, pak pět hráčů (`max_peers` 5), PC se serverem. Kontrola
`mumr-server.log`, jestli všechna zařízení načetla poslední verzi. Pak: uložení kampaně, zvuk v prostoru, mapování místnosti.

**Fáze 7: one-shot scénář.** Jeden kompletní scénář 2 až 3 hodiny, hraný od začátku do konce.

## 10. Technická rizika

| Riziko | Dopad | Co s tím |
|---|---|---|
| Wi-Fi zlobí, Quest ztratí spojení | drak „zmizí“ na chvíli | MUMR má znovupřipojení (10 s), host drží stav |
| Rozpoznání řeči a hlasy se zpožděním | zážitek se rozpadne | hlasy předem vygenerované; rozpoznávání lokálně na PC, měřit latenci |
| Pět headsetů | více dat, horší Wi-Fi | fáze 6; zatím testováno jen do čtyř, nejdřív zátěžový test |
| Drak větší než místnost | hráči do něj narazí | měřítko a výška se ladí ve fázi 3 |
| Kostky lze podvést | hra ztrácí smysl | kostky počítá host |
| Cizí hráč v síti | MUMR nemá přihlášení | hrát ve vlastní síti |
| AI působí hloupě | hráči ztrácí zájem | nejdřív jednoduché cíle a paměť; ladění podle logu |
| Všechno netestováno na headsetu | neznámé chyby | fáze 6, vždy s logem |

## 11. Otevřené otázky

Rozhodnutí zadavatele (2026-10-22):

1. **Pět hráčů:** všichni na headsetech. Engine nastavit `max_peers` na 5 a udělat zátěžový test.
2. **Nejlevnější varianta:** vše běží na PC, bez placených služeb. Hlas se generuje lokálně a předem (open source TTS, např. Piper),
   headsety dostanou hotové audio. Licenci každého hlasu ověřit: některé modely nejsou pro komerční použití.
3. **Hlas vypravěče:** angličtina.
4. **Rozhodování hlasem, co nejvíc in-person larp:** hráči mluví nahlas. Rozpoznávání řeči běží lokálně na PC (open source,
   např. whisper.cpp). Každý headset posílá vlastní zvukový proud, takže se hlasy nemíchají a host ví, kdo mluví. Host převádí
   řeč na záměr podle klíčových slov a frází, které scénář zná.
5. **Příběh vzniká rozhodnutími:** scénář je strom uzlů a podmínek; hlasová rozhodnutí a stav světa vybírají větev. Jazykový
   model se nepoužívá; případně až později. První scénář je v [scenario_01_ember_hollow.md](scenario_01_ember_hollow.md).
6. **Obsah:** píšeme vlastní texty, jména a bytosti. Mechanismy (d20, hody, iniciativa) nejsou autorským dílem; jména, texty
   a bytosti z D&D nebo SRD nepoužíváme. Není to právní rada; před veřejným vydáním by to měl zkontrolovat právník.
7. **Zvuky:** vlastní nahrávky, nebo volné knihovny s jasnou licencí (např. CC0). Licenci ověřit u každého zvuku.

## 12. Stav k dnešnímu dni (2026-10-22)

- Fáze 0 a 1 hotové. Commit `2331d1b` na větvi `add-dnd-example` (není pushnutá, bez PR).
- Žádný model draka zatím nemáme.
- Žádná VR část, žádné zvuky, žádný host zatím neexistují.
- Log serveru `mumr-server.log` v `examples/dnd/` je ignorovaný gitem.

### Doplněno 2026-10-23: aplikace `apps/dnd`

- Vznikla skutečná aplikace [apps/dnd](../apps/dnd/README.md) (ne příklad; `examples/dnd` zůstává). Hraje se **bez XR**: hráči na
  telefonech nebo v prohlížeči, stránka vypravěče/game mastera na PC (`gm.html`), hlas vypravěče z reproduktoru PC.
- Host (`host.js`) dělá vše náhodné a všechny výsledky (sekce 3): kostky, zkoušky, souboj na tahy, AI bytostí s pamětí (hrozba,
  úcta, zášť), uložení kampaně do `saves/campaign.json`. Fáze 4 je tedy hotová bez prostorové části.
- Scénáře jako strom uzlů s podmínkami (sekce 11, bod 5): `s00` tutoriál (20 min), `s01` Ember Hollow (celý, 4 konce), `s02`
  Greyford (45 min). Formát v [apps/dnd/scenarios/README.md](../apps/dnd/scenarios/README.md); simulátor `tools/dnd-sim.js`.
- Řeč: zatím ji píše game master nebo hráč (záměr se z textu bere stejně, jako se bude brát z rozpoznané řeči).
- Zkušební hry: [trial_runs.md](trial_runs.md). Otázky: [follow_up_questions.md](follow_up_questions.md).

## 13. Další krok

Po odpovědích na otázky v [sekci 11](#11-otevřené-otázky) se upraví sekce 4 až 8 a začne fáze 2 (předměty jako tělesa),
nebo fáze 3 (drak), pokud je k dispozici model.
