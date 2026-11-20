# Spoontastic - Ontwerp en bouwplan

**Status:** ontwerp en bouwplan goedgekeurd; dependency-installatie goedgekeurd.

## Ontwerp

### Doel

Een rustige, speelbare browserprototype van Spoontastic waarin de speler met een swipe voorspelt of een lepel naar links of rechts buigt. Een goede voorspelling levert geld en reputatie op; na iedere voorspelling lost de lepel op in lichte beige deeltjes met enkele groene, rode en blauwe accenten en verschijnt er een nieuwe.

### Spelronde

1. De speler ziet een lepel op een tafel vanuit een vaste, licht schuine top-down camera.
2. De speler swipet horizontaal over de lepel om links of rechts te voorspellen. Links/rechts-knoppen zijn beschikbaar als alternatief voor muis, touchpad of toetsenbord.
3. Het spel kiest onafhankelijk een buigrichting en toont die met een korte, rustige 3D-animatie.
4. Bij een juiste voorspelling krijgt de speler geld en reputatie. Na de buiging volgt bij elke uitkomst een korte pauze en lost de lepel op in lichte beige deeltjes met enkele groene, rode en blauwe accenten; daarna komt er een nieuwe.
5. De HUD werkt geld, reputatie en nauwkeurigheid bij. De speler kan geld uitgeven aan een upgrade die de beloning per goede voorspelling verhoogt.

De prototypeversie gebruikt één lepel per ronde en twee mogelijke richtingen. De buigrichting is willekeurig, zodat de voorspelling daadwerkelijk onzeker is. De nauwkeurigheid is het aantal juiste voorspellingen gedeeld door alle afgeronde voorspellingen.

### Presentatie en bediening

- Een rustig, gestileerd 3D-tafelblad is het speelveld; de scène is het belangrijkste element van het scherm.
- **Sfeer en decor:** een donkere waarzeggerstent met paarse wand- en zijgordijnen, warm kaarslicht en gouden details. Lantaarns, maskers, een wandplank en spiegel hangen verspreid over de gordijnen; tafelprops staan in losse, asymmetrische groepjes en laten het midden vrij voor de lepel.
- De lepel wordt als 3D-model uit Three.js-geometrie opgebouwd. Buigen en de particle-verdwijning zijn zichtbare animaties.
- Een compacte HTML/CSS-HUD toont geld, reputatie, nauwkeurigheid, upgrade en rondefeedback.
- Ondersteun muis, touchpad, touch en toetsenbord. Respecteer `prefers-reduced-motion` voor niet-essentiële effecten.
- Sla voortgang lokaal op in `localStorage`; een herlaadtest controleert dat de gegevens terugkomen.

### Ontwerpschets: lepels vanuit de zijkant buigen

Deze zichtwijziging vervangt de lichte schuine top-down presentatie niet door een vrije orbitcamera. De lepeltableau blijft onderdeel van de vaste tafel, maar wordt gericht als een nauw, magiërachtig zijaanzicht.

- **Camera:** vaste camera op ooghoogte of licht verhoogd, recht vanaf de lange zijde van de tafel. De lepel ligt horizontaal met de steel van links naar rechts in beeld en het lepelblad aan één kant.
- **Startpositie:** de lepel ligt recht en relatief onbeweeglijk op tafel, met het midden duidelijk zichtbaar. De tafel blijft naast de lepel donker genoeg om het buigprofiel te benadrukken.
- **Voorspelling:** links/rechts-swipe of toetsenbordbediening bepaalt alleen links/rechts. De horizontale plaats en ritme blijven visueel kort en duidelijk.
- **Buiganimatie:** bij de onthulling buigt het midden/blad van de lepel soepel in één richting. Links buigt met een duidelijke negatieve X-bocht; rechts met een positieve X-bocht. De overgang tussen blad en steel vervormt vloeiend mee, terwijl de basis van de steel op zijn plek blijft en het grootste deel van de steel recht blijft.
- **Juiste voorspelling:** het buigen wordt rustig voltooid; na een pauze lost de lepel op in lichte beige deeltjes met enkele gekleurde accenten.
- **Foute voorspelling:** dezelfde buiging en particle-verdwijning volgen; de HUD meldt de foute voorspelling en het scherm schudt kort terwijl een rode randflits naar het midden toe transparant vervaagt.
- **Continuïteit:** dezelfde spelregels, nauwkeurigheid, beloningen en toetsen blijven gelden. Alleen camera, lepelformatuur en beweegruimte veranderen.
- **Beweging:** gebruik korte Cubic Ease-bewegingen voor het buigen en respecteer `prefers-reduced-motion` bij niet-essentiële effecten.

### Ontwerpschets: particle-verdwijning na elke voorspelling

- **Trigger:** na iedere voorspelling, goed of fout, zodra de onthulde buiging klaar is.
- **Pauze:** wacht na het einde van de buiging 0,5 seconde voordat het effect begint.
- **Effect:** veel kleine lichte beige deeltjes met enkele groene, rode en blauwe accenten, verdeeld over de hele lepel inclusief het steeltje, waaieren een klein stukje uit en vervagen. Het steeleinde krijgt minder deeltjes dan de rest van de lepel. In de eerste 0,1 seconde van het effect wordt de volledige lepel onzichtbaar en daarna uit de scène verwijderd; alleen de deeltjes blijven over.
- **Timing:** de deeltjes verdwijnen in ongeveer 0,7 seconde nadat het effect begint. Na hun fade verschijnt de volgende lepel.
- **Ronde-afhandeling:** na het uitdoven wordt de oude lepel opgeruimd, verschijnt een nieuwe lepel en kan de speler opnieuw voorspellen.
- **Techniek en scope:** maak het effect in de bestaande Three.js-scène zonder nieuwe packages. De spelregels, beloningen en nauwkeurigheid veranderen niet.
- **Toegankelijkheid:** respecteer `prefers-reduced-motion` met minder spreiding en een kortere fade.

### Afbakening

In deze eerste speelbare versie zitten geen prestige, volledige tech tree, batches lepels, leaderboard, audio, Steam-integratie of online functies. Die onderdelen kunnen na gebruikerstests worden ontworpen. Er is ook geen monetisatie of account nodig.

## Bouwplan

### Techniek

- Vite voor de lokale ontwikkelserver en build.
- Three.js voor scene, camera, tafel, lepel en rendering.
- Rapier voor de lepelbeweging en het vallen.
- JavaScript-modules voor de spelregels, rendering en UI; spelregels blijven onafhankelijk van Three.js.
- Vitest voor tests van de spelregels.
- `localStorage` voor de lokale save.

De benodigde packages zijn na toestemming geïnstalleerd.

### Rondes

1. Projectbasis en schermindeling opzetten met Vite en de benodigde packages.
2. De spelregels implementeren en testen: richting kiezen, voorspelling beoordelen, beloning en nauwkeurigheid berekenen, upgrade toepassen en voortgang opslaan/herstellen.
3. De 3D-scène maken met camera, tafel, lepel en Rapier-animaties.
4. Bediening en HUD aansluiten op de spelregels, inclusief feedback bij goed/fout en de upgrade.
5. Tests draaien en de game in de browser controleren op desktop en mobiel; problemen oplossen en opleveren.

### Testplan

- Een juiste en foute voorspelling leveren de verwachte uitkomst en beloning op.
- Nauwkeurigheid klopt bij meerdere pogingen en is gedefinieerd bij nul pogingen.
- De upgrade verandert de beloning en is niet koopbaar zonder voldoende geld.
- Een opgeslagen voortgang wordt na herladen hersteld; ongeldige of ontbrekende savegegevens laten het spel bruikbaar starten.
- De lepel buigt zichtbaar in beide richtingen; na een goede en foute voorspelling verdwijnen lepel en deeltjes volgens de afgesproken timing en is opnieuw voorspellen mogelijk.
- Swipe, knoppen en toetsenbordbediening werken; HUD-elementen overlappen niet bij desktop- en mobiele breedtes.

## Goedkeuring

Het ontwerp, bouwplan en de installatie van de genoemde packages zijn goedgekeurd.