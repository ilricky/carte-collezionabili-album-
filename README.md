🎴 TCG Location - Digital Twin Shop
Benvenuto in TCG Location, una piattaforma avanzata per la gestione e la vendita di carte collezionabili Pokémon. Il sistema utilizza un'architettura moderna che sincronizza dati in tempo reale tra un database cloud, un'interfaccia utente reattiva e un sistema di automazione per il caricamento massivo tramite CSV.

🚀 Caratteristiche Principali
Sincronizzazione Cloud: Integrazione nativa con Supabase per la persistenza dei dati.

Automazione n8n: Workflow intelligente per il recupero automatico di immagini e dati tecnici tramite le API di TCGdex.

Local First: Sistema di caching avanzato tramite IndexedDB per caricamenti istantanei delle immagini e navigazione fluida.

Gestione Prezzi: Separazione chiara tra Prezzo Acquisto (investimento) e Prezzo Negozio (vendita).

Zero Doppioni: Logica di Upsert basata su vincoli di unicità nel database per evitare ridondanze.

🛠️ Architettura Tecnica
Il progetto si basa su tre pilastri fondamentali:

1. Il Database (Supabase)
La tabella inventario_asset è il cuore del sistema. È configurata con un vincolo di unicità sulla colonna nome_carta per garantire l'integrità dei dati.

SQL
ALTER TABLE public.inventario_asset ADD CONSTRAINT unique_nome_carta UNIQUE (nome_carta);
2. Workflow n8n (Automazione)
Il caricamento delle carte avviene tramite un file CSV. n8n elabora ogni riga, interroga le API esterne e aggiorna il database.

Extract from File: Legge il CSV (Nome, Espansione, Prezzo Acquisto).

HTTP Request: Recupera l'URL dell'immagine ufficiale da TCGdex.

Supabase Node: Esegue un'operazione di Upsert per inserire nuove carte o aggiornare i prezzi di quelle esistenti.

3. Frontend (Marketplace Premium)
L'interfaccia mostra le carte in vendita. Grazie al sistema System Status, l'utente può monitorare la latenza del cloud e lo stato della memoria locale.

📦 Come configurare il Workflow n8n
Per caricare correttamente i dati come mostrato nelle immagini di sistema:

Importa il CSV: Assicurati che le colonne siano nome_carta, espansione, condizione, prezzo_acquisto.

Configura l'URL Immagine: Nel nodo finale di Supabase, usa la seguente espressione per ottenere immagini in alta definizione:
{{ $json.image }}/high.webp

Evita i Doppioni: Imposta l'operazione su Update (o Upsert) utilizzando nome_carta come Match Column.

🖥️ Utilizzo del Portale
Caricamento: Clicca su "CARICA CSV" nell'interfaccia per avviare il processo.

Reset Cache: In caso di discrepanze tra database e visualizzazione, utilizza l'icona del Cestino nel widget System Status. Questo forzerà il rinfresco dei dati da Supabase eliminando la vecchia cache IndexedDB.

📂 Struttura File
/app.js: Logica di rendering e gestione cache locale.

/style.css: Design moderno con supporto Dark Mode e Tailwind CSS.

/workflow.json: Esportazione del workflow n8n.

Nota: Questo progetto è stato sviluppato per collezionisti che necessitano di una sincronizzazione rapida tra il proprio inventario fisico (CSV) e la vetrina digitale.
