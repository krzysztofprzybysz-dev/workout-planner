# Workout Planner - Adaptive AI

Aplikacja do sledzenia treningow na podstawie programu Jeff Nippard Essentials 3x/week.
Wykorzystuje Claude AI do analizy wynikow i dostosowywania ciezarow.

## Uruchomienie

### 1. Konfiguracja

Utworz plik `.env` w folderze `server/`:

```
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3001
```

### 2. Instalacja zaleznosci

```bash
cd C:\silownia\app
npm run setup
```

Lub recznie:
```bash
npm install
cd client && npm install
cd ../server && npm install
```

### 3. Inicjalizacja bazy danych

```bash
npm run seed
```

### 4. Uruchomienie aplikacji

```bash
npm run dev
```

Aplikacja bedzie dostepna pod:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Struktura projektu

```
app/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Komponenty UI
│   │   ├── pages/          # Strony aplikacji
│   │   └── hooks/          # React hooks
│   └── package.json
├── server/                 # Node.js backend
│   ├── db/                 # Schema i seed
│   ├── routes/             # API endpoints
│   ├── services/           # Claude API
│   └── workout.db          # SQLite database
└── data/
    └── program.json        # Dane programu treningowego
```

## Funkcje

### Trening
- Wyswietla dzisiejszy trening z kartami cwiczen
- Rozne typy serii: warm-up, working, heavy, back-off, dropset, superserie
- Logowanie ciezarow, powtorzen i RPE
- Pasek postepu treningu

### Historia
- Lista ukonczonych treningow
- Szczegoly kazdej sesji
- Analiza AI dla kazdego treningu

### Postepy
- Wykres ciezarow dla wybranego cwiczenia
- Statystyki (max ciezar, liczba treningow)

### Analiza AI (Claude)
Po zakonczeniu treningu Claude analizuje wyniki i:
- Ocenia wykonanie cwiczen
- Proponuje ciezary na nastepny trening
- Uwzglednia RPE i zakres powtorzen

## API Endpoints

- `GET /api/workouts/current` - aktualny tydzien/dzien
- `GET /api/workouts/:week/:day` - trening na konkretny dzien
- `POST /api/workouts/session/start` - rozpocznij sesje
- `POST /api/workouts/session/:id/set` - zapisz serie
- `POST /api/workouts/session/:id/finish` - zakoncz trening
- `POST /api/analysis/workout/:id` - analiza AI
- `GET /api/workouts/history` - historia treningow
- `GET /api/workouts/exercise/:id/history` - historia cwiczenia
