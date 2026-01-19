import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from './logger.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
- NIGDY nie zmieniaj ciezaru o wiecej niz 10% w gore lub 15% w dol miedzy tygodniami
- Back-off ZAWSZE = 75-85% ciezaru heavy
- Wszystkie ciezary zaokraglaj do 0.5kg (hantle) lub 2.5kg (maszyny/sztangi)
- Rekomendacje MUSZA byc oparte na rzeczywistych danych z treningu
- Jesli brak danych - utrzymaj poprzednia wage

WAZNE:
- Badz konkretny - podawaj dokladne ciezary
- Jesli uzytkownik ma notatke o bolu/kontuzji - uwzglednij to w rekomendacji
- Analizuj trend - jesli ciezary stoja w miejscu, zasugeruj strategie`;

const weeklySystemPrompt = `Jestes trenerem personalnym analizujacym CALY TYDZIEN treningow wedlug programu Jeff Nippard Essentials.

Twoja rola to:
1. Podsumowac postepy z calego tygodnia (3 dni treningowe)
2. Zidentyfikowac trendy - ktore cwiczenia ida do gory, ktore stoja w miejscu
3. Zaproponowac strategie na nastepny tydzien
4. Uwzglednic regeneracje i zmeczenie miedzy dniami

STRUKTURA TYGODNIA:
- Dzien 1: Full Body (compound + izolacja)
- Dzien 2: Upper Body Focus
- Dzien 3: Lower Body Focus

ANALIZA POWINNA OBEJMOWAC:
- Porownanie wynikow z poprzednimi tygodniami
- Identyfikacja cwiczen wymagajacych uwagi
- Ocena intensywnosci (srednie RPE)
- Notatki uzytkownika z calego tygodnia

KRYTYCZNE OGRANICZENIA:
- Maksymalna progresja: +10% ciezaru tygodniowo
- Maksymalny regres: -15% ciezaru (przy problemach)
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

    // Validate heavy_weight (max ±50% change to allow AI flexibility for significant adjustments)
    if (rec.heavy_weight !== null && rec.heavy_weight !== undefined) {
      const maxIncrease = baselineWeight * 1.50;
      const maxDecrease = baselineWeight * 0.50;
      if (rec.heavy_weight > maxIncrease || rec.heavy_weight < maxDecrease) {
        logger.validation.corrected(exerciseName, 'heavy', rec.heavy_weight, baselineWeight, 'outside ±50% bounds');
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

    // Validate working_weight (max ±50% change to allow AI flexibility for significant adjustments)
    if (rec.working_weight !== null && rec.working_weight !== undefined) {
      // Use targetWeight as baseline, not actualWeight
      const workingBaseline = workingSet?.targetWeight || workingSet?.actualWeight || baselineWeight;
      const maxIncrease = workingBaseline * 1.50;
      const maxDecrease = workingBaseline * 0.50;
      if (rec.working_weight > maxIncrease || rec.working_weight < maxDecrease) {
        logger.validation.corrected(exerciseName, 'working', rec.working_weight, workingBaseline, 'outside ±50% bounds');
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
 */
export async function analyzeWeek({ week, sessions, setLogs, previousWeeksData, weekNotes }) {
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

Przeanalizuj caly tydzien i zaproponuj strategie na nastepny tydzien.
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
