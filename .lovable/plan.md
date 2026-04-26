
# 🥗 Dashboard Progressi Dietologici

Una dashboard personale (single user) dove carichi il documento `.doc` che ti dà la dietologa e tutto il resto avviene in automatico: AI legge i numeri, te li fa confermare, popola il database, aggiorna grafici e KPI con commenti in linguaggio umano.

---

## 🎨 Stile visivo

- **Palette wellness moderna**: verde acqua (teal/aqua) come colore primario, bianchi caldi, accenti corallo per gli alert.
- **Dual mode**: tema chiaro e tema scuro con toggle in alto a destra (preferenza salvata).
- Tipografia pulita, card con angoli morbidi, micro-animazioni leggere sui grafici.
- Mobile-first: la dashboard è perfettamente leggibile anche da telefono.

---

## 📤 Flusso di upload (cuore dell'app)

1. **Pulsante "Carica nuovo referto"** in evidenza nella home.
2. Trascini o selezioni il file `.doc` (o `.docx`).
3. Il file viene **archiviato** così com'è (storico consultabile/scaricabile in seguito).
4. L'AI lo analizza ed estrae:
   - Dati anagrafici (la prima volta soltanto)
   - Anamnesi familiare e patologica + terapia
   - **Misurazioni della visita**: data, peso, circonferenze (braccio, vita, addome, coscia, anche, torace, collo, avambraccio, polso)
   - **Composizione corporea**: massa grassa %, massa magra kg, massa ossea, BMI, età metabolica, idratazione, grasso viscerale
   - **DEXA segmental**: massa grassa/magra per braccio dx, braccio sx, gamba dx, gamba sx, tronco
   - **Esami ematochimici**: emoglobina, glicemia, gamma GT, ALT, AST, colesterolo totale, HDL, trigliceridi (con date diverse, es. Gennaio 25 / Giugno 25)
   - **Anamnesi alimentare**: colazione, pranzo, cena, spuntini, preferenze, intolleranze
5. **Schermata di conferma**: vedi una tabella riepilogativa con tutti i campi estratti, modificabili. Click su "Conferma" → tutto va nel database e la dashboard si aggiorna istantaneamente.
6. Se l'estrazione fallisce su qualche campo, lo segnala in giallo invitandoti a compilarlo manualmente.

---

## 📊 Dashboard — sezioni e KPI

### 1. Header riepilogativo
- Foto/iniziali, peso attuale, peso obiettivo, **distanza dall'obiettivo** ("-7 kg al traguardo"), barra di avanzamento %.
- Data ultima visita + countdown "ultima misurazione 23 giorni fa".

### 2. ⚖️ Peso & BMI
- **Grafico a linea** del peso nel tempo con tutte le visite, tooltip ricco e annotazioni sulle visite.
- **KPI**: peso attuale, variazione vs visita precedente, variazione totale dall'inizio, BMI attuale con etichetta ("sovrappeso / obeso classe I" ecc.) e fascia colorata.
- **Insight automatico**: "Hai perso 5 kg in 4 mesi, ritmo medio -1,2 kg/mese — perfettamente nella fascia salutare."

### 3. 🧬 Composizione corporea
- Tre grafici affiancati: **massa grassa %**, **massa magra kg**, **grasso viscerale**.
- KPI con valore corrente, range ideale e indicatore semaforo (verde/giallo/rosso).
- **Età metabolica vs età anagrafica** con commento ("hai 33 anni, la tua età metabolica è 47 → 14 anni di gap, in miglioramento di 3 da gennaio").
- **Mappa corpo segmentale**: silhouette con i 5 segmenti DEXA (braccia, gambe, tronco) colorati in base alla % di grasso, click su un segmento per il dettaglio.

### 4. 📏 Circonferenze
- Grafico multi-linea con vita, addome, braccio, coscia ecc.
- **Rapporto vita/altezza** evidenziato (indicatore di rischio cardiovascolare): "0,60 — sopra la soglia di rischio (0,50). In calo di 0,03 da gennaio".
- Variazioni cm dall'ultima visita, mostrate per ogni misura.

### 5. 🩸 Esami ematochimici
- Per ogni valore (colesterolo, trigliceridi, HDL, ALT, AST, gamma GT, glicemia, emoglobina): grafico, valore corrente, **range di riferimento clinico**, badge "nella norma / da monitorare / fuori range".
- **Insight automatico**: "Trigliceridi scesi da 292 a 142 mg/dL — eccellente, ora dentro il range. ALT ancora sopra la norma ma in netto miglioramento."

### 6. 🎯 Obiettivo peso
- Campo modificabile "Peso target" (es. 80 kg).
- Mostra: kg mancanti, % completata, **proiezione data di arrivo** basata sul ritmo attuale, ritmo settimanale/mensile, totale perso/preso da inizio percorso.

### 7. 📅 Storico visite & file
- Timeline cronologica di tutte le visite.
- Per ognuna: data, peso, link per scaricare il `.doc` originale, possibilità di rivedere/modificare i dati estratti, eliminare la visita.

### 8. 💬 Linguaggio umano (insight automatici)
Generati da regole sui tuoi dati, in italiano semplice. Esempi:
- "Negli ultimi 3 mesi hai perso 4,9 kg mantenendo la massa magra: stai perdendo grasso, non muscolo. Ottimo segnale."
- "Il tuo grasso viscerale è 9,5 — sei sceso sotto la soglia di rischio (10). Continua così."
- "Le tue circonferenze vita e addome calano insieme al peso: il dimagrimento è ben distribuito."

---

## 🗄️ Persistenza

Tutto su database con queste aree:
- **Profilo** (anagrafica, altezza, obiettivo peso)
- **Visite** (data, peso, note, link al file originale)
- **Misure circonferenze** (legate alla visita)
- **Composizione corporea** (legate alla visita, incluso DEXA per segmento)
- **Esami ematochimici** (legati alla data dell'esame, possono essercene più di uno per visita)
- **Anamnesi & terapia** (storicizzate, solo l'ultima è "attiva")
- **File originali** archiviati in storage privato

Niente login (single user come richiesto): la dashboard è tua. In futuro si potrà aggiungere autenticazione senza ribaltare nulla.

---

## 🛠️ Cosa attivo dietro le quinte

- **Lovable Cloud** per database e storage del file `.doc`.
- **Lovable AI Gateway** per l'estrazione strutturata dal documento (gratuito fino al 13 ottobre 2025, poi pochi centesimi a estrazione).
- Parser per `.doc`/`.docx` lato server.

---

## 🚀 Cosa avrai alla fine

Una dashboard personale dove:
1. Apri l'app → vedi subito i tuoi progressi.
2. Esci dalla dietologa → carichi il `.doc` → 30 secondi di conferma → tutto aggiornato.
3. Scorri grafici, KPI e commenti in italiano che ti dicono come stai andando davvero.
4. Lo storico è sempre tuo: dati + file originali, scaricabili quando vuoi.
