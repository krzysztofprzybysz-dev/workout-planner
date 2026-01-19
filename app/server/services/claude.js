import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from './logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Konfiguracja typów serii per ćwiczenie i dzień
// Określa DOKŁADNIE jakie typy serii ma dane ćwiczenie w danym dniu
// Format: 'NazwaCwiczenia_dzień' -> ['typy', 'serii']
export const EXERCISE_SET_CONFIG = {
  // Day 1 - Full Body
  'Leg Press_1': ['heavy', 'backoff'],          // 4-6 reps @ RPE 9 + 8-10 reps @ RPE 8
  'Incline DB Press_1': ['working'],            // 2x 8-10 reps @ RPE 8
  'Seated Hamstring Curl_1': ['working'],       // 1x 10-12 reps @ RPE 9
  'T-Bar Row_1': ['working'],                   // 2x 10-12 reps @ RPE 8
  'DB Bicep Curl_1': ['working', 'dropset'],    // 1x 10-12 reps @ RPE 9-10 + dropset
  'DB Lateral Raise_1': ['working', 'dropset'], // 1x 12-15 reps @ RPE 10 + dropset
  'Cable Crunch_1': ['working', 'dropset'],     // 1x 12-15 reps @ RPE 10 + dropset

  // Day 2 - Upper Body
  'Flat DB Press_2': ['heavy', 'backoff'],      // 4-6 reps @ RPE 9 + 8-10 reps @ RPE 8
  '2-Grip Lat Pulldown_2': ['working'],         // 2x 10-12 reps @ RPE 8
  'Seated DB Shoulder Press_2': ['working'],    // 2x 8-10 reps @ RPE 8
  'Seated Cable Row_2': ['working', 'dropset'], // 2x 10-12 reps @ RPE 8-9 + dropset
  'EZ Bar Skull Crusher_2': ['working'],        // 2x 10-12 reps (superset)
  'EZ Bar Curl_2': ['working'],                 // 2x 8-10 reps (superset)

  // Day 3 - Lower Body
  'Romanian Deadlift_3': ['working'],           // 2x 10-12 reps @ RPE 8
  'Leg Press_3': ['working'],                   // 3x 10-12 reps @ RPE 8-9 (BEZ heavy!)
  'Leg Extension_3': ['working', 'dropset'],    // 1x 10-12 reps @ RPE 9-10 + dropset
  'Seated Calf Raise_3': ['working'],           // 2x 12-15 reps (superset)
  'Cable Crunch_3': ['working'],                // 2x 12-15 reps (superset, BEZ dropset!)
};

// Load program rules
let programRules = {};
try {
  const rulesPath = join(__dirname, '../../data/program-rules.json');
  programRules = JSON.parse(readFileSync(rulesPath, 'utf-8'));
  logger.debug('CLAUDE', 'Loaded program-rules.json');
} catch (error) {
  logger.warn('CLAUDE', `Could not load program-rules.json: ${error.message}`);
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const systemPrompt = `Jestes trenerem personalnym analizujacym trening wedlug programu Jeff Nippard Essentials.

FILOZOFIA PROGRAMU:
- Low volume, high intensity - kazda seria musi byc maksymalnie efektywna
- "Beating the logbook" - kluczem jest progresywne zwiekszanie obciazenia
- Jakosc > ilosc - lepiej 1 ciezka seria niz 3 przecietne

ZASADY PROGRESJI:
1. Heavy sets (4-6 reps, RPE 8-9):
   - Wykonano 6 powt. przy RPE <=8 -> +2.5-5kg nastepnym razem
   - Wykonano 4-5 powt. przy RPE 8-9 -> utrzymaj, celuj w wiecej reps
   - RPE 10 lub <4 powt. -> -5% ciezaru

2. Back-off sets (8-10 reps, RPE 8-9):
   - Zawsze ~80-85% ciezaru z Heavy seta
   - Wykonano 10 powt. przy RPE <=8 -> +2.5kg

3. Working sets (10-12 reps, RPE 9-10):
   - Wykonano 12 powt. przy RPE <=9 -> +1-2.5kg
   - Dla izolacji (biceps, triceps, barki) -> +0.5-1kg

4. Dropsets:
   - Glowna seria: 12-15 reps do RPE 10
   - Drop: 50% ciezaru, max reps
   - Progresja gdy glowna seria >15 reps przy RPE 9

TYPY CWICZEN:
- Compound (Leg Press, DB Press, Row): wieksze skoki (2.5-5kg)
- Isolation (Curls, Raises, Extensions): mniejsze skoki (0.5-2kg)
- Hantle: progresja co 1-2kg (dostepne ciezary)

UWZGLEDNIJ:
- Notatki uzytkownika (bol, zmeczenie, technika)
- Historie poprzednich treningow
- Trend progresji (czy ciezary rosna czy stoja w miejscu)

KRYTYCZNE OGRANICZENIA:
- NIGDY nie zmieniaj ciezaru o wiecej niz 20% w gore lub w dol miedzy tygodniami
- Back-off ZAWSZE = 75-85% ciezaru heavy
- Wszystkie ciezary zaokraglaj do 0.5kg (hantle) lub 2.5kg (maszyny/sztangi)
- Rekomendacje MUSZA byc oparte na rzeczywistych danych z treningu
- Jesli brak danych - utrzymaj poprzednia wage

TYPY SERII PER CWICZENIE - BARDZO WAZNE:
Nie wszystkie cwiczenia maja wszystkie typy serii! Rekomenduj TYLKO te typy serii, ktore dane cwiczenie faktycznie ma.

DZIEN 1 (Full Body):
- Leg Press: heavy (4-6 reps @ RPE 9) + backoff (8-10 reps @ RPE 8)
- Incline DB Press: 2x working (8-10 reps @ RPE 8)
- Seated Hamstring Curl: 1x working (10-12 reps @ RPE 9)
- T-Bar Row: 2x working (10-12 reps @ RPE 8)
- DB Bicep Curl: working + dropset (10-12 reps @ RPE 9-10)
- DB Lateral Raise: working + dropset (12-15 reps @ RPE 10)
- Cable Crunch: working + dropset (12-15 reps @ RPE 10)

DZIEN 2 (Upper Body):
- Flat DB Press: heavy (4-6 reps @ RPE 9) + backoff (8-10 reps @ RPE 8)
- 2-Grip Lat Pulldown: 2x working (10-12 reps @ RPE 8)
- Seated DB Shoulder Press: 2x working (8-10 reps @ RPE 8)
- Seated Cable Row: 2x working + dropset (10-12 reps @ RPE 8-9)
- EZ Bar Skull Crusher: 2x working (10-12 reps, superset)
- EZ Bar Curl: 2x working (8-10 reps, superset)

DZIEN 3 (Lower Body):
- Romanian Deadlift: 2x working (10-12 reps @ RPE 8)
- Leg Press: 3x working (10-12 reps @ RPE 8-9) - BEZ heavy! Inny schemat niz D1!
- Leg Extension: working + dropset (10-12 reps @ RPE 9-10)
- Seated Calf Raise: 2x working (12-15 reps, superset)
- Cable Crunch: 2x working (12-15 reps, superset) - BEZ dropset! Inaczej niz D1!

WAZNE:
- Badz konkretny - podawaj dokladne ciezary
- Jesli uzytkownik ma notatke o bolu/kontuzji - uwzglednij to w rekomendacji
- Analizuj trend - jesli ciezary stoja w miejscu, zasugeruj strategie
- Dla D3 Leg Press podaj TYLKO working_weight (nie heavy_weight!)
- Dla D3 Cable Crunch NIE podawaj dropset_weight!`;

const weeklySystemPrompt = `Jestes trenerem personalnym analizujacym CALY TYDZIEN treningow wedlug programu Jeff Nippard Essentials.

Twoja rola to:
1. Podsumowac postepy z calego tygodnia (3 dni treningowe)
2. Zidentyfikowac trendy - ktore cwiczenia ida do gory, ktore stoja w miejscu
3. Zaproponowac strategie na nastepny tydzien
4. Uwzglednic regeneracje i zmeczenie miedzy dniami
5. Wykorzystac dzienne analizy AI jako kontekst i punkt wyjscia

STRUKTURA TYGODNIA:
- Dzien 1: Full Body (compound + izolacja)
- Dzien 2: Upper Body Focus
- Dzien 3: Lower Body Focus

CWICZENIA POWTARZAJACE SIE - UWAGA NA ROZNICE W STRUKTURZE:
- Leg Press w D1: heavy (4-6 reps @ RPE 9) + backoff (8-10 reps @ RPE 8)
- Leg Press w D3: 3x working (10-12 reps @ RPE 8-9) - ZUPELNIE INNY SCHEMAT! BEZ heavy!

- Cable Crunch w D1: working + dropset (12-15 reps @ RPE 10)
- Cable Crunch w D3: 2x working (superset, 12-15 reps) - BEZ dropsetu!

Rekomendacje dla W2D1 i W2D3 MUSZA uwzgledniac te roznice:
- Dla D1 Leg Press: podaj heavy_weight i backoff_weight
- Dla D3 Leg Press: podaj TYLKO working_weight
- Dla D1 Cable Crunch: podaj working_weight i dropset_weight
- Dla D3 Cable Crunch: podaj TYLKO working_weight

ANALIZA POWINNA OBEJMOWAC:
- Porownanie wynikow z poprzednimi tygodniami
- Identyfikacja cwiczen wymagajacych uwagi
- Ocena intensywnosci (srednie RPE)
- Notatki uzytkownika z calego tygodnia
- Dzienne analizy AI (mozesz je potwierdzic, zmodyfikowac lub nadpisac)

KRYTYCZNE OGRANICZENIA:
- Maksymalna zmiana: ±20% ciezaru tygodniowo
- Wszystkie wagi zaokraglone do 0.5kg lub 2.5kg
- Rekomendacje MUSZA byc oparte na danych`;

export async function analyzeWorkout({ session, setLogs, previousData, sessionNotes }) {
  // Group set logs by exercise
  const exerciseData = {};
  for (const log of setLogs) {
    if (!exerciseData[log.exercise_name]) {
      exerciseData[log.exercise_name] = {
        muscleGroup: log.muscle_group,
        sets: []
      };
    }
    exerciseData[log.exercise_name].sets.push({
      type: log.set_type,
      targetWeight: log.target_weight,
      actualWeight: log.actual_weight,
      targetReps: log.target_reps,
      actualReps: log.actual_reps,
      rpe: log.rpe,
      notes: log.notes
    });
  }

  // Group previous data by exercise name with dates
  const historyData = {};
  for (const data of previousData) {
    const exerciseName = data.exercise_name;
    if (!exerciseName) continue;

    if (!historyData[exerciseName]) {
      historyData[exerciseName] = [];
    }
    historyData[exerciseName].push({
      date: data.finished_at,
      setType: data.set_type,
      weight: data.actual_weight,
      reps: data.actual_reps,
      rpe: data.rpe
    });
  }

  // Calculate trends for each exercise
  const trends = {};
  for (const [exerciseName, history] of Object.entries(historyData)) {
    if (history.length >= 2) {
      // Get heavy/working sets only for trend analysis
      const workingSets = history.filter(h => h.setType === 'heavy' || h.setType === 'working');
      if (workingSets.length >= 2) {
        const latest = workingSets[0]?.weight || 0;
        const previous = workingSets[workingSets.length - 1]?.weight || 0;
        trends[exerciseName] = {
          direction: latest > previous ? 'rosnacy' : (latest < previous ? 'malejacy' : 'stagnacja'),
          latestWeight: latest,
          previousWeight: previous,
          sessionsAnalyzed: workingSets.length
        };
      }
    }
  }

  // Get day name based on day number
  const dayNames = {
    1: 'Full Body',
    2: 'Upper Body',
    3: 'Lower Body'
  };
  const dayName = dayNames[session.day] || `Dzien ${session.day}`;

  const userPrompt = `DZISIEJSZY TRENING: Tydzien ${session.week}, Dzien ${session.day} (${dayName})

WYKONANE CWICZENIA:
${JSON.stringify(exerciseData, null, 2)}

HISTORIA POPRZEDNICH TRENINGOW (ten sam dzien):
${Object.keys(historyData).length > 0 ? JSON.stringify(historyData, null, 2) : 'Brak poprzednich danych - to pierwszy trening tego dnia'}

TRENDY PROGRESJI:
${Object.keys(trends).length > 0 ? JSON.stringify(trends, null, 2) : 'Brak wystarczajacych danych do analizy trendu'}

NOTATKI UZYTKOWNIKA Z TRENINGU:
${sessionNotes || 'Brak'}

Przeanalizuj wyniki i zaproponuj ciezary na nastepny trening tego dnia.
Zwroc TYLKO JSON (bez zadnego tekstu przed ani po):
{
  "analysis": "2-3 zdania ogolnej analizy po polsku",
  "exerciseAnalysis": {
    "NazwaCwiczenia": "1 zdanie o tym cwiczeniu"
  },
  "nextWorkout": {
    "NazwaCwiczenia": {
      "heavy_weight": number|null,
      "backoff_weight": number|null,
      "working_weight": number|null,
      "dropset_weight": number|null,
      "reason": "krotkie uzasadnienie"
    }
  }
}`;

  try {
    logger.claude.calling('daily analysis', { week: session.week, day: session.day, exercises: Object.keys(exerciseData).length });

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent, data-driven recommendations
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: systemPrompt
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const tokens = message.usage?.output_tokens;
    logger.claude.response(duration, tokens);

    // Extract the text content
    const responseText = message.content[0].text;

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.claude.parsing(false, 'No JSON found in response');
      throw new Error('No valid JSON in response');
    }

    const result = JSON.parse(jsonMatch[0]);
    logger.claude.parsing(true, { exercises: Object.keys(result.nextWorkout || {}).length });

    // Validate and sanitize AI recommendations
    if (result.nextWorkout) {
      result.nextWorkout = validateRecommendations(result.nextWorkout, exerciseData);
    }

    return result;
  } catch (error) {
    logger.claude.error(error, { function: 'analyzeWorkout', week: session.week, day: session.day });

    // Return a fallback analysis if API fails
    return {
      analysis: 'Nie udalo sie uzyskac analizy AI. Utrzymaj obecne ciezary i sprobuj ponownie nastepnym razem.',
      exerciseAnalysis: {},
      nextWorkout: {}
    };
  }
}

/**
 * Validate AI recommendations to prevent hallucinations
 * - Ensures weight changes are within reasonable bounds (±20% of current)
 * - Ensures backoff is 75-90% of heavy weight
 * - Rounds weights to appropriate increments
 */
function validateRecommendations(recommendations, currentData) {
  const validated = {};

  for (const [exerciseName, rec] of Object.entries(recommendations)) {
    const current = currentData[exerciseName];
    if (!current) {
      validated[exerciseName] = rec;
      continue;
    }

    // Get the current heavy/working weight as baseline
    // IMPORTANT: Use targetWeight (program goal) as baseline, not actualWeight (what user lifted)
    // This allows AI to suggest appropriate reductions when user struggles with the target weight
    const heavySet = current.sets.find(s => s.type === 'heavy');
    const workingSet = current.sets.find(s => s.type === 'working');
    const baselineWeight = heavySet?.targetWeight || workingSet?.targetWeight || heavySet?.actualWeight || workingSet?.actualWeight || 0;

    if (baselineWeight === 0) {
      validated[exerciseName] = rec;
      continue;
    }

    const validatedRec = { ...rec };

    // Validate heavy_weight (max ±20% change - reasonable limit for weekly progression)
    if (rec.heavy_weight !== null && rec.heavy_weight !== undefined) {
      const maxIncrease = baselineWeight * 1.20;
      const maxDecrease = baselineWeight * 0.80;
      if (rec.heavy_weight > maxIncrease || rec.heavy_weight < maxDecrease) {
        logger.validation.corrected(exerciseName, 'heavy', rec.heavy_weight, baselineWeight, 'outside ±20% bounds');
        validatedRec.heavy_weight = baselineWeight;
        validatedRec.reason = (validatedRec.reason || '') + ' [Skorygowano - zbyt duza zmiana]';
      } else {
        logger.validation.approved(exerciseName, 'heavy', rec.heavy_weight);
      }
      validatedRec.heavy_weight = roundWeight(validatedRec.heavy_weight);
    }

    // Validate backoff_weight (should be 75-90% of heavy)
    if (rec.backoff_weight !== null && rec.backoff_weight !== undefined) {
      const heavyWeight = validatedRec.heavy_weight || baselineWeight;
      const expectedBackoffMin = heavyWeight * 0.75;
      const expectedBackoffMax = heavyWeight * 0.90;

      if (rec.backoff_weight < expectedBackoffMin || rec.backoff_weight > expectedBackoffMax) {
        const correctedWeight = roundWeight(heavyWeight * 0.80);
        logger.validation.corrected(exerciseName, 'backoff', rec.backoff_weight, correctedWeight, 'corrected to 80% of heavy');
        validatedRec.backoff_weight = correctedWeight;
        validatedRec.reason = (validatedRec.reason || '') + ' [Backoff skorygowany do 80% heavy]';
      } else {
        logger.validation.approved(exerciseName, 'backoff', rec.backoff_weight);
      }
      validatedRec.backoff_weight = roundWeight(validatedRec.backoff_weight);
    }

    // Validate working_weight (max ±20% change - reasonable limit for weekly progression)
    if (rec.working_weight !== null && rec.working_weight !== undefined) {
      // Use targetWeight as baseline, not actualWeight
      const workingBaseline = workingSet?.targetWeight || workingSet?.actualWeight || baselineWeight;
      const maxIncrease = workingBaseline * 1.20;
      const maxDecrease = workingBaseline * 0.80;
      if (rec.working_weight > maxIncrease || rec.working_weight < maxDecrease) {
        logger.validation.corrected(exerciseName, 'working', rec.working_weight, workingBaseline, 'outside ±20% bounds');
        validatedRec.working_weight = workingBaseline;
        validatedRec.reason = (validatedRec.reason || '') + ' [Skorygowano - zbyt duza zmiana]';
      } else {
        logger.validation.approved(exerciseName, 'working', rec.working_weight);
      }
      validatedRec.working_weight = roundWeight(validatedRec.working_weight);
    }

    // Validate dropset_weight
    if (rec.dropset_weight !== null && rec.dropset_weight !== undefined) {
      validatedRec.dropset_weight = roundWeight(rec.dropset_weight);
    }

    validated[exerciseName] = validatedRec;
  }

  return validated;
}

/**
 * Round weight to appropriate increment
 * - Dumbbells: 0.5kg increments
 * - Machines/Barbells: 2.5kg increments
 */
function roundWeight(weight) {
  if (weight <= 20) {
    // Likely dumbbells or small weights - round to 0.5kg
    return Math.round(weight * 2) / 2;
  } else {
    // Larger weights - round to 2.5kg
    return Math.round(weight / 2.5) * 2.5;
  }
}

/**
 * Analyze entire week after Day 3 completion
 * @param {Object} params
 * @param {number} params.week - Week number
 * @param {Array} params.sessions - All sessions from this week
 * @param {Array} params.setLogs - All set logs from this week
 * @param {Array} params.previousWeeksData - Historical data from previous weeks
 * @param {string} params.weekNotes - Notes from all sessions this week
 * @param {Array} params.dailyAnalyses - Daily AI analyses from each session (optional)
 */
export async function analyzeWeek({ week, sessions, setLogs, previousWeeksData, weekNotes, dailyAnalyses = [] }) {
  // Group set logs by day and exercise
  const weekData = {
    day1: {},
    day2: {},
    day3: {}
  };

  for (const log of setLogs) {
    const dayKey = `day${log.day}`;
    if (!weekData[dayKey]) continue;

    if (!weekData[dayKey][log.exercise_name]) {
      weekData[dayKey][log.exercise_name] = {
        muscleGroup: log.muscle_group,
        sets: []
      };
    }
    weekData[dayKey][log.exercise_name].sets.push({
      type: log.set_type,
      targetWeight: log.target_weight,
      actualWeight: log.actual_weight,
      targetReps: log.target_reps,
      actualReps: log.actual_reps,
      rpe: log.rpe
    });
  }

  // Group previous weeks data for trends
  const weeklyTrends = {};
  for (const data of previousWeeksData) {
    if (!data.exercise_name) continue;
    const key = `${data.exercise_name}_week${data.week}_day${data.day}`;
    if (!weeklyTrends[data.exercise_name]) {
      weeklyTrends[data.exercise_name] = [];
    }
    weeklyTrends[data.exercise_name].push({
      week: data.week,
      day: data.day,
      setType: data.set_type,
      weight: data.actual_weight,
      reps: data.actual_reps,
      rpe: data.rpe
    });
  }

  const userPrompt = `ANALIZA TYGODNIA ${week}

DZIEN 1 (Full Body):
${JSON.stringify(weekData.day1, null, 2)}

DZIEN 2 (Upper Body):
${JSON.stringify(weekData.day2, null, 2)}

DZIEN 3 (Lower Body):
${JSON.stringify(weekData.day3, null, 2)}

HISTORIA POPRZEDNICH TYGODNI:
${Object.keys(weeklyTrends).length > 0 ? JSON.stringify(weeklyTrends, null, 2) : 'Brak danych z poprzednich tygodni'}

NOTATKI Z CALEGO TYGODNIA:
${weekNotes || 'Brak notatek'}

DZIENNE ANALIZY AI (wykorzystaj jako kontekst):
${dailyAnalyses.length > 0
  ? dailyAnalyses.map(da => `Dzień ${da.day}: ${da.analysis.analysis || 'Brak analizy'}`).join('\n')
  : 'Brak dziennych analiz'}

Przeanalizuj caly tydzien i zaproponuj strategie na nastepny tydzien.
Wykorzystaj dzienne analizy jako punkt wyjscia - mozesz je potwierdzic, zmodyfikowac lub nadpisac
na podstawie pelnego obrazu tygodnia.
Zwroc TYLKO JSON (bez zadnego tekstu przed ani po):
{
  "weekSummary": "3-4 zdania podsumowania tygodnia po polsku",
  "strengths": ["mocne strony tego tygodnia"],
  "improvements": ["obszary do poprawy"],
  "nextWeekStrategy": "ogolna strategia na nastepny tydzien",
  "nextWeekRecommendations": {
    "1": {
      "NazwaCwiczeniaDzien1": {
        "heavy_weight": number|null,
        "backoff_weight": number|null,
        "working_weight": number|null,
        "dropset_weight": number|null,
        "reason": "uzasadnienie"
      }
    },
    "2": {
      "NazwaCwiczeniaDzien2": { ... }
    },
    "3": {
      "NazwaCwiczeniaDzien3": { ... }
    }
  }
}`;

  try {
    logger.claude.calling('weekly analysis', { week, sessions: sessions.length });

    const startTime = Date.now();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: weeklySystemPrompt
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const tokens = message.usage?.output_tokens;
    logger.claude.response(duration, tokens);

    const responseText = message.content[0].text;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.claude.parsing(false, 'No JSON found in weekly response');
      throw new Error('No valid JSON in weekly analysis response');
    }

    const result = JSON.parse(jsonMatch[0]);
    logger.claude.parsing(true, { days: Object.keys(result.nextWeekRecommendations || {}).length });

    // Validate recommendations for each day
    if (result.nextWeekRecommendations) {
      for (const [day, exercises] of Object.entries(result.nextWeekRecommendations)) {
        const dayData = weekData[`day${day}`] || {};
        result.nextWeekRecommendations[day] = validateRecommendations(exercises, dayData);
      }
    }

    logger.info('CLAUDE', `Weekly analysis complete for W${week}`);
    return result;
  } catch (error) {
    logger.claude.error(error, { function: 'analyzeWeek', week });
    return {
      weekSummary: 'Nie udalo sie przeanalizowac tygodnia. Kontynuuj z aktualnymi ciezarami.',
      strengths: [],
      improvements: [],
      nextWeekStrategy: 'Utrzymaj obecna intensywnosc',
      nextWeekRecommendations: {}
    };
  }
}
