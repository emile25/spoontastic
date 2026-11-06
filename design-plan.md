# Spoontastic - Ontwerp en bouwplan

**Status:** ontwerp en bouwplan goedgekeurd; dependency-installatie goedgekeurd.

## Ontwerp

### Doel

Een rustige, speelbare browserprototype van Spoontastic waarin de speler met een swipe voorspelt of een lepel naar links of rechts buigt. Een goede voorspelling levert geld en reputatie op; bij een foute voorspelling valt de lepel van tafel en verschijnt er een nieuwe.

### Spelronde

1. De speler ziet een lepel op een tafel vanuit een vaste, licht schuine top-down camera.
2. De speler swipet horizontaal over de lepel om links of rechts te voorspellen. Links/rechts-knoppen zijn beschikbaar als alternatief voor muis, touchpad of toetsenbord.
3. Het spel kiest onafhankelijk een buigrichting en toont die met een korte, rustige 3D-animatie.
4. Bij een juiste voorspelling krijgt de speler geld en reputatie. Bij een foute voorspelling valt de lepel van tafel; daarna komt er een nieuwe.
5. De HUD werkt geld, reputatie en nauwkeurigheid bij. De speler kan geld uitgeven aan een upgrade die de beloning per goede voorspelling verhoogt.

De prototypeversie gebruikt één lepel per ronde en twee mogelijke richtingen. De buigrichting is willekeurig, zodat de voorspelling daadwerkelijk onzeker is. De nauwkeurigheid is het aantal juiste voorspellingen gedeeld door alle afgeronde voorspellingen.

### Presentatie en bediening

- Een rustig, gestileerd 3D-tafelblad is het speelveld; de scène is het belangrijkste element van het scherm.
- De lepel wordt als 3D-model uit Three.js-geometrie opgebouwd. Buigen en van tafel vallen zijn zichtbare animaties; Rapier verzorgt de fysieke beweging.
- Een compacte HTML/CSS-HUD toont geld, reputatie, nauwkeurigheid, upgrade en rondefeedback.
- Ondersteun muis, touchpad, touch en toetsenbord. Respecteer `prefers-reduced-motion` voor niet-essentiële effecten.
- Sla voortgang lokaal op in `localStorage`; een herlaadtest controleert dat de gegevens terugkomen.

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
- De lepel buigt zichtbaar in beide richtingen en valt bij een fout van tafel; daarna is opnieuw voorspellen mogelijk.
- Swipe, knoppen en toetsenbordbediening werken; HUD-elementen overlappen niet bij desktop- en mobiele breedtes.

## Goedkeuring

Het ontwerp, bouwplan en de installatie van de genoemde packages zijn goedgekeurd.