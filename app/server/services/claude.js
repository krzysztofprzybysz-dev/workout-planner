import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from './logger.js';
import { roundWeightByExercise } from '../utils/warmupCalculator.js';

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
  'Machine Crunch_1': ['working', 'dropset'],    // 1x 12-15 reps @ RPE 10 + dropset

  // Day 2 - Upper Body
  'Flat DB Press_2': ['heavy', 'backoff'],      // 4-6 reps @ RPE 9 + 8-10 reps @ RPE 8
  '2-Grip Lat Pulldown_2': ['working'],         // 2x 10-12 reps @ RPE 8
  'Seated DB Shoulder Press_2': ['working'],    // 2x 8-10 reps @ RPE 8
  'Seated Cable Row_2': ['working', 'dropset'], // 2x 10-12 reps @ RPE 8-9 + dropset
  'EZ Bar Skull Crusher_2': ['working'],        // 2x 10-12 reps (superset)
  'EZ Bar Curl_2': ['working'],                 // 2x 8-10 reps (superset)
  'Machine Crunch_2': ['working', 'dropset'],   // 1x 12-15 reps @ RPE 8 + dropset

  // Day 3 - Lower Body
  'Romanian Deadlift_3': ['working'],           // 2x 10-12 reps @ RPE 8
  'Leg Press_3': ['working'],                   // 3x 10-12 reps @ RPE 8-9 (BEZ heavy!)
  'Leg Extension_3': ['working', 'dropset'],    // 1x 10-12 reps @ RPE 9-10 + dropset
  'Seated Calf Raise_3': ['working'],           // 2x 12-15 reps (superset)
  'Machine Crunch_3': ['working'],               // 2x 12-15 reps (superset, BEZ dropset!)
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

// Load Jeff Nippard context from jeffpdf
let jeffContext = {};
try {
  const contextPath = join(__dirname, '../../data/jeffpdf-context.json');
  jeffContext = JSON.parse(readFileSync(contextPath, 'utf-8'));
  logger.debug('CLAUDE', 'Loaded jeffpdf-context.json');
} catch (error) {
  logger.warn('CLAUDE', `Could not load jeffpdf-context.json: ${error.message}`);
}

// ============= UTILITY FUNCTIONS =============

/**
 * Sanitize user input to prevent prompt injection
 * - Removes potential instruction-like patterns
 * - Limits length to prevent context overflow
 * - Escapes special formatting characters
 * @param {string} input - Raw user input
 * @param {number} maxLength - Maximum allowed length (default 500)
 * @returns {string} - Sanitized input
 */
function sanitizeUserInput(input, maxLength = 500) {
  if (!input || typeof input !== 'string') return '';

  let sanitized = input
    // Remove potential system/assistant role markers
    .replace(/\b(system|assistant|human|user):\s*/gi, '')
    // Remove XML-like tags that could be interpreted as instructions
    .replace(/<\/?[^>]+>/g, '')
    // Remove potential JSON injection
    .replace(/[{}[\]]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength) + '...';
  }

  return sanitized;
}

// ============= METRIC CALCULATION FUNCTIONS =============

/**
 * Calculate average RPE from set logs
 * @param {Array} setLogs - Array of set log objects with rpe property
 * @returns {number|null} - Average RPE or null if no data
 */
function calculateAverageRpe(setLogs) {
  const rpeValues = setLogs.filter(log => log.rpe != null).map(log => log.rpe);
  if (rpeValues.length === 0) return null;
  return (rpeValues.reduce((sum, rpe) => sum + rpe, 0) / rpeValues.length).toFixed(1);
}

/**
 * Calculate percentage of sets where actual matched or exceeded target
 * @param {Array} setLogs - Array of set log objects
 * @returns {number} - Percentage (0-100)
 */
function calculateTargetHitRate(setLogs) {
  const relevantLogs = setLogs.filter(log => log.target_reps != null && log.actual_reps != null);
  if (relevantLogs.length === 0) return 100;
  const hits = relevantLogs.filter(log => log.actual_reps >= log.target_reps).length;
  return Math.round((hits / relevantLogs.length) * 100);
}

/**
 * Calculate weekly volume trend from previous data
 * @param {Array} previousData - Historical set logs
 * @returns {object} - Volume trend info
 */
function calculateWeeklyVolume(previousData) {
  if (!previousData || previousData.length === 0) {
    return { trend: 'brak danych', totalSets: 0 };
  }

  // Group by week
  const weeklyVolume = {};
  for (const log of previousData) {
    const week = log.week || 'unknown';
    if (!weeklyVolume[week]) {
      weeklyVolume[week] = { sets: 0, totalWeight: 0 };
    }
    weeklyVolume[week].sets++;
    weeklyVolume[week].totalWeight += (log.actual_weight || 0) * (log.actual_reps || 0);
  }

  const weeks = Object.keys(weeklyVolume).sort((a, b) => b - a);
  if (weeks.length < 2) {
    return { trend: 'niewystarczajace dane', totalSets: weeklyVolume[weeks[0]]?.sets || 0 };
  }

  const latestWeek = weeklyVolume[weeks[0]];
  const previousWeek = weeklyVolume[weeks[1]];

  if (latestWeek.totalWeight > previousWeek.totalWeight * 1.05) {
    return { trend: 'rosnacy (+5%)', totalSets: latestWeek.sets };
  } else if (latestWeek.totalWeight < previousWeek.totalWeight * 0.95) {
    return { trend: 'malejacy (-5%)', totalSets: latestWeek.sets };
  }
  return { trend: 'stabilny', totalSets: latestWeek.sets };
}

/**
 * Calculate average rest times between sets by set type
 * @param {Array} setLogs - Array of set log objects with completed_at timestamps
 * @returns {object} - { heavy: avgSeconds, working: avgSeconds, ... }
 */
function calculateRestTimes(setLogs) {
  if (!setLogs || setLogs.length < 2) {
    return { average: null, bySetType: {} };
  }

  // Sort by exercise and then by completed_at
  const sortedLogs = [...setLogs]
    .filter(log => log.completed_at)
    .sort((a, b) => {
      if (a.exercise_id !== b.exercise_id) return a.exercise_id - b.exercise_id;
      return new Date(a.completed_at) - new Date(b.completed_at);
    });

  if (sortedLogs.length < 2) {
    return { average: null, bySetType: {} };
  }

  const restTimesByType = {};
  const allRestTimes = [];

  for (let i = 1; i < sortedLogs.length; i++) {
    const prevLog = sortedLogs[i - 1];
    const currentLog = sortedLogs[i];

    // Only calculate rest time for sets of the same exercise
    if (prevLog.exercise_id !== currentLog.exercise_id) continue;

    const prevTime = new Date(prevLog.completed_at);
    const currentTime = new Date(currentLog.completed_at);
    const restSeconds = Math.round((currentTime - prevTime) / 1000);

    // Only count reasonable rest times (30s to 10min)
    if (restSeconds >= 30 && restSeconds <= 600) {
      const setType = currentLog.set_type || 'unknown';
      if (!restTimesByType[setType]) {
        restTimesByType[setType] = [];
      }
      restTimesByType[setType].push(restSeconds);
      allRestTimes.push(restSeconds);
    }
  }

  // Calculate averages
  const bySetType = {};
  for (const [type, times] of Object.entries(restTimesByType)) {
    if (times.length > 0) {
      bySetType[type] = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    }
  }

  const average = allRestTimes.length > 0
    ? Math.round(allRestTimes.reduce((a, b) => a + b, 0) / allRestTimes.length)
    : null;

  return { average, bySetType };
}

/**
 * Extract recurring issues from notes across sessions
 * @param {Array} previousData - Historical data with notes
 * @returns {Array<string>} - List of recurring issues
 */
function extractRecurringIssues(previousData) {
  const issueKeywords = {
    'bol': 'Bol/dyskomfort',
    'boli': 'Bol/dyskomfort',
    'kolano': 'Problem z kolanem',
    'plecy': 'Problem z plecami',
    'bark': 'Problem z barkiem',
    'nadgarstek': 'Problem z nadgarstkiem',
    'zmeczenie': 'Zmeczenie',
    'zmeczony': 'Zmeczenie',
    'slabo': 'Slaba forma',
    'technika': 'Problemy z technika',
    'forma': 'Problemy z forma'
  };

  const foundIssues = new Set();

  for (const log of previousData) {
    if (log.notes) {
      const noteLower = log.notes.toLowerCase();
      for (const [keyword, issue] of Object.entries(issueKeywords)) {
        if (noteLower.includes(keyword)) {
          foundIssues.add(issue);
        }
      }
    }
  }

  return Array.from(foundIssues);
}

/**
 * Determine if a light session (single session with reduced intensity) should be suggested
 * Based on Jeff Nippard's autoregulation approach - NOT a full week deload
 * @param {Array} historyData - Historical performance data
 * @param {object} currentSession - Current session data
 * @returns {object} - { suggest: boolean, reason: string, severity: string }
 */
function shouldSuggestLightSession(historyData, currentSession) {
  const reasons = [];
  let severity = 'none';

  if (!historyData || historyData.length < 6) {
    return { suggest: false, reason: 'Niewystarczajace dane historyczne', severity: 'none' };
  }

  // Check 1: No progression for 3+ weeks
  const exerciseProgress = {};
  for (const log of historyData) {
    const key = `${log.exercise_name}_${log.set_type}`;
    if (!exerciseProgress[key]) {
      exerciseProgress[key] = [];
    }
    exerciseProgress[key].push({ week: log.week, weight: log.actual_weight });
  }

  for (const [key, data] of Object.entries(exerciseProgress)) {
    const sortedData = data.sort((a, b) => b.week - a.week);
    if (sortedData.length >= 3) {
      const weights = sortedData.slice(0, 3).map(d => d.weight);
      const maxWeight = Math.max(...weights);
      const minWeight = Math.min(...weights);
      // If all weights are within 2% of each other for 3 weeks = stagnation
      if (maxWeight > 0 && (maxWeight - minWeight) / maxWeight < 0.02) {
        reasons.push(`Stagnacja w ${key.split('_')[0]} przez 3+ tygodnie`);
        severity = 'moderate';
      }
    }
  }

  // Check 2: Consistent RPE 10 (failure) on all sets
  const recentLogs = historyData.filter(log => log.week >= (currentSession.week - 1));
  const rpe10Count = recentLogs.filter(log => log.rpe >= 10).length;
  const totalRecentLogs = recentLogs.length;

  if (totalRecentLogs >= 5 && rpe10Count / totalRecentLogs > 0.7) {
    reasons.push('Ponad 70% serii na RPE 10 (failure) w ostatnich 2 tygodniach');
    severity = 'high';
  }

  // Check 3: Recurring pain/fatigue notes
  const recurringIssues = extractRecurringIssues(historyData);
  if (recurringIssues.some(issue => issue.includes('Bol') || issue.includes('Problem'))) {
    reasons.push('Powtarzajace sie notatki o bolu/dyskomforcie');
    severity = severity === 'high' ? 'high' : 'moderate';
  }

  // Check 4: Significant strength decrease
  for (const [key, data] of Object.entries(exerciseProgress)) {
    const sortedData = data.sort((a, b) => b.week - a.week);
    if (sortedData.length >= 2 && sortedData[0].weight < sortedData[sortedData.length - 1].weight * 0.9) {
      reasons.push(`Spadek sily o >10% w ${key.split('_')[0]}`);
      severity = 'high';
    }
  }

  return {
    suggest: reasons.length > 0,
    reason: reasons.join('; '),
    severity
  };
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Build system prompt dynamically with program rules and Jeff context
function buildSystemPrompt() {
  const exerciseRulesText = programRules.exerciseRules
    ? Object.entries(programRules.exerciseRules)
        .map(([name, rule]) => `- ${name}: ${rule.type}, krok +${rule.progressionStep}kg (min ${rule.minProgression}kg) - ${rule.notes}`)
        .join('\n')
    : 'Brak zaladowanych regul cwiczen';

  const setTypeRulesText = programRules.setTypeRules
    ? Object.entries(programRules.setTypeRules)
        .map(([type, rules]) => {
          const prog = rules.progression;
          return `${type.toUpperCase()}: ${rules.reps} reps @ RPE ${Array.isArray(rules.targetRpe) ? rules.targetRpe.join('-') : rules.targetRpe}
    - Zwieksz: ${prog?.increase || 'N/A'}
    - Utrzymaj: ${prog?.maintain || 'N/A'}
    - Zmniejsz: ${prog?.decrease || 'N/A'}`;
        })
        .join('\n\n')
    : 'Brak zaladowanych regul typow serii';

  const rpeScaleText = jeffContext.rpeScale
    ? Object.entries(jeffContext.rpeScale)
        .map(([rpe, desc]) => `RPE ${rpe}: ${desc}`)
        .join('\n')
    : 'Standardowa skala RPE 1-10';

  const deloadTriggersText = jeffContext.deloadTriggers
    ? jeffContext.deloadTriggers.map(t => `- ${t}`).join('\n')
    : '- Brak progresji przez 3+ tygodnie\n- Systematyczne RPE 10\n- Notatki o bolu';

  return `Jestes trenerem personalnym analizujacym trening wedlug programu Jeff Nippard Essentials.

FILOZOFIA PROGRAMU (z oficjalnego PDF):
${jeffContext.trainingPhilosophy ? Object.entries(jeffContext.trainingPhilosophy).map(([k, v]) => `- ${v}`).join('\n') : `- Low volume, high intensity - kazda seria musi byc maksymalnie efektywna
- "Beating the logbook" - kluczem jest progresywne zwiekszanie obciazenia
- Jakosc > ilosc - lepiej 1 ciezka seria niz 3 przecietne`}

SKALA RPE (Rate of Perceived Exertion):
${rpeScaleText}

INTERPRETACJA RPE:
${jeffContext.rpeInterpretation ? `- ${jeffContext.rpeInterpretation.targetRpe}
- ${jeffContext.rpeInterpretation.example}
- ${jeffContext.rpeInterpretation.adjustWeight}` : '- Cel RPE dotyczy OSTATNIEJ serii. Wczesniejsze serie beda latwiejsze.'}

ZASADY PROGRESJI PER TYP SERII:
${setTypeRulesText}

ZASADY PROGRESJI PER CWICZENIE:
${exerciseRulesText}

AUTOREGULACJA:
${jeffContext.autoregulation ? `- Zasada: ${jeffContext.autoregulation.principle}
- Dobry dzien: ${jeffContext.autoregulation.goodDay}
- Slaby dzien: ${jeffContext.autoregulation.badDay}
- Uczciwosc: ${jeffContext.autoregulation.honesty}` : '- Dostosowuj ciezary na podstawie samopoczucia danego dnia'}

KIEDY SUGEROWAC LIGHT SESSION (lzejsza sesja):
${deloadTriggersText}

PROTOKOL LIGHT SESSION (pojedyncza sesja - NIE caly tydzien):
${jeffContext.lightSessionProtocol ? `- Trigger: ${jeffContext.lightSessionProtocol.trigger}
- Redukcja ciezaru: ${jeffContext.lightSessionProtocol.weightReduction}
- Cel RPE: ${jeffContext.lightSessionProtocol.rpeTarget}
- Czas trwania: ${jeffContext.lightSessionProtocol.duration}
- Powrot: ${jeffContext.lightSessionProtocol.returnStrategy}` : `- Trigger: Wykryto zmeczenie/bol w biezacej sesji
- Redukcja: -10% do -15% ciezaru
- Cel RPE: 6-7
- Czas: TYLKO ta sesja, nie caly tydzien
- Powrot: Nastepna sesja normalnie`}

KRYTYCZNE OGRANICZENIA:
- HARD CAP na zwiekszenie ciezaru: Compound +5kg/tydz, Isolation +2kg/tydz
- Maksymalny spadek: -20% (tylko dla deload)
- Back-off ZAWSZE = 75-85% ciezaru heavy
- Wszystkie ciezary zaokraglaj do pelnych kilogramow (brak polowek na silowni)
- Hantle: minimum 4kg, inkrementacja co 1kg (4, 5, 6, 7, 8...)
- Rekomendacje MUSZA byc oparte na rzeczywistych danych z treningu
- Jesli brak danych - utrzymaj poprzednia wage

WAZNE - TYPY SERII:
- Rekomenduj TYLKO typy serii, ktore cwiczenie faktycznie ma w danym dniu
- System automatycznie odfiltruje nieprawidlowe rekomendacje
- Leg Press D1: heavy + backoff | D3: TYLKO working
- Machine Crunch D1: working + dropset | D2: working + dropset | D3: TYLKO working

WAZNE:
- Badz konkretny - podawaj dokladne ciezary
- Jesli uzytkownik ma notatke o bolu/kontuzji - uwzglednij to w rekomendacji
- Analizuj trend - jesli ciezary stoja w miejscu, zasugeruj strategie lub light session
- Jesli metryki wskazuja na potrzebe odpoczynku - dodaj to do analizy`;
}

const systemPrompt = buildSystemPrompt();

// Build weekly system prompt dynamically
function buildWeeklySystemPrompt() {
  const blockStrategyText = jeffContext.blockStrategy
    ? Object.entries(jeffContext.blockStrategy)
        .map(([week, data]) => `- ${week.toUpperCase()}: ${data.focus} - ${data.approach}`)
        .join('\n')
    : '- WEEK1: Ustal baseline\n- WEEK2: Delikatna progresja\n- WEEK3: Kontynuuj progresje\n- WEEK4: Peak/deload';

  return `Jestes trenerem personalnym analizujacym CALY TYDZIEN treningow wedlug programu Jeff Nippard Essentials.

Twoja rola to:
1. Podsumowac postepy z calego tygodnia (3 dni treningowe)
2. Zidentyfikowac trendy - ktore cwiczenia ida do gory, ktore stoja w miejscu
3. Zaproponowac strategie na nastepny tydzien
4. Uwzglednic regeneracje i zmeczenie miedzy dniami
5. Wykorzystac dzienne analizy AI jako kontekst i punkt wyjscia
6. Ocenic czy potrzebny jest light session na podstawie metryk

STRATEGIA BLOKOWA (4-tygodniowe cykle):
${blockStrategyText}

STRUKTURA TYGODNIA:
- Dzien 1: Full Body (compound + izolacja)
- Dzien 2: Upper Body Focus
- Dzien 3: Lower Body Focus

CWICZENIA POWTARZAJACE SIE - UWAGA NA ROZNICE W STRUKTURZE:
- Leg Press w D1: heavy (4-6 reps @ RPE 9) + backoff (8-10 reps @ RPE 8)
- Leg Press w D3: 3x working (10-12 reps @ RPE 8-9) - ZUPELNIE INNY SCHEMAT! BEZ heavy!
- Machine Crunch w D1: working + dropset (12-15 reps @ RPE 10)
- Machine Crunch w D2: working + dropset (12-15 reps @ RPE 8)
- Machine Crunch w D3: 2x working (superset, 12-15 reps) - BEZ dropsetu!

ANALIZA POWINNA OBEJMOWAC:
- Porownanie wynikow z poprzednimi tygodniami
- Identyfikacja cwiczen wymagajacych uwagi
- Ocena intensywnosci (srednie RPE)
- Notatki uzytkownika z calego tygodnia
- Dzienne analizy AI (mozesz je potwierdzic, zmodyfikowac lub nadpisac)
- METRYKI SESJI (srednie RPE, hit rate, trend wolumenu)

KIEDY SUGEROWAC LIGHT SESSION:
${jeffContext.deloadTriggers ? jeffContext.deloadTriggers.map(t => `- ${t}`).join('\n') : '- Brak progresji przez 3+ tygodnie\n- Systematyczne RPE 10\n- Notatki o bolu'}

PROTOKOL LIGHT SESSION (pojedyncza sesja - NIE caly tydzien):
${jeffContext.lightSessionProtocol ? `- Redukcja: ${jeffContext.lightSessionProtocol.weightReduction}
- Cel RPE: ${jeffContext.lightSessionProtocol.rpeTarget}
- Czas: ${jeffContext.lightSessionProtocol.duration}` : '- Zmniejsz ciazar o 10-15%, celuj w RPE 6-7, tylko ta sesja'}

KRYTYCZNE OGRANICZENIA:
- HARD CAP na zwiekszenie: Compound +5kg/tydz, Isolation +2kg/tydz
- Maksymalny spadek: -20% (tylko dla deload)
- Wszystkie ciezary zaokraglaj do pelnych kilogramow (brak polowek na silowni)
- Hantle: minimum 4kg, inkrementacja co 1kg (4, 5, 6, 7, 8...)
- Rekomendacje MUSZA byc oparte na danych
- Dla D1 Leg Press: podaj heavy_weight i backoff_weight
- Dla D3 Leg Press: podaj TYLKO working_weight
- Dla D1 Machine Crunch: podaj working_weight i dropset_weight
- Dla D3 Machine Crunch: podaj TYLKO working_weight`;
}

const weeklySystemPrompt = buildWeeklySystemPrompt();

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
      // Get heavy/working sets only for trend analysis, sorted by date descending
      const workingSets = history
        .filter(h => h.setType === 'heavy' || h.setType === 'working')
        .sort((a, b) => new Date(b.date) - new Date(a.date));
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

  // Calculate new metrics
  const avgRpe = calculateAverageRpe(setLogs);
  const targetHitRate = calculateTargetHitRate(setLogs);
  const weeklyVolume = calculateWeeklyVolume(previousData);
  const recurringIssues = extractRecurringIssues(previousData);
  const deloadCheck = shouldSuggestLightSession(previousData, session);
  const restTimes = calculateRestTimes(setLogs);

  // Determine block week position (1-4 cycle)
  const blockWeek = ((session.week - 1) % 4) + 1;
  const blockStrategy = jeffContext.blockStrategy?.[`week${blockWeek}`];

  // Build list of valid exercises and their set types for this day
  const validExercisesForDay = Object.keys(exerciseData).map(name => {
    const configKey = `${name}_${session.day}`;
    const allowedTypes = EXERCISE_SET_CONFIG[configKey] || ['working'];
    return `- ${name}: ${allowedTypes.join(', ')}`;
  }).join('\n');

  const userPrompt = `DZISIEJSZY TRENING: Tydzien ${session.week}, Dzien ${session.day} (${dayName})
POZYCJA W BLOKU: Tydzien ${blockWeek} z 4 ${blockStrategy ? `- ${blockStrategy.focus}` : ''}

WAZNE - DOZWOLONE CWICZENIA I ICH TYPY SERII DLA TEGO DNIA:
${validExercisesForDay}
Rekomenduj TYLKO te cwiczenia i TYLKO wymienione typy serii. Nie dodawaj innych.

WYKONANE CWICZENIA:
${JSON.stringify(exerciseData, null, 2)}

METRYKI SESJI:
- Srednie RPE: ${avgRpe !== null ? avgRpe : 'brak danych'}
- Procent osiagnietych celow (reps): ${targetHitRate}%
- Trend wolumenu tygodniowego: ${weeklyVolume.trend}
- Powtarzajace sie problemy: ${recurringIssues.length > 0 ? recurringIssues.join(', ') : 'Brak'}
- Czas przerwy: ${restTimes.average ? `sredni ${restTimes.average}s` : 'brak danych'}${Object.keys(restTimes.bySetType).length > 0 ? ` (${Object.entries(restTimes.bySetType).map(([type, sec]) => `${type}: ${sec}s`).join(', ')})` : ''}
${deloadCheck.suggest ? `
UWAGA - ROZWAŻ LIGHT SESSION:
- Powod: ${deloadCheck.reason}
- Powaga: ${deloadCheck.severity}
` : ''}
HISTORIA POPRZEDNICH TRENINGOW (ten sam dzien):
${Object.keys(historyData).length > 0 ? JSON.stringify(historyData, null, 2) : 'Brak poprzednich danych - to pierwszy trening tego dnia'}

TRENDY PROGRESJI:
${Object.keys(trends).length > 0 ? JSON.stringify(trends, null, 2) : 'Brak wystarczajacych danych do analizy trendu'}

NOTATKI UZYTKOWNIKA Z TRENINGU:
${sanitizeUserInput(sessionNotes) || 'Brak'}

Przeanalizuj wyniki i zaproponuj ciezary na nastepny trening tego dnia.
${deloadCheck.suggest ? 'Jesli uznasz light session za uzasadniony, zaproponuj zmniejszone ciezary (-10 do -15%) tylko na ta sesje i dodaj to do analizy.' : ''}
Zwroc TYLKO JSON (bez zadnego tekstu przed ani po):
{
  "analysis": "2-3 zdania ogolnej analizy po polsku",
  "exerciseAnalysis": {
    "NazwaCwiczenia": "1 zdanie o tym cwiczeniu"
  },
  "lightSessionSuggested": boolean,
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
    logger.claude.calling('daily analysis', {
      week: session.week,
      day: session.day,
      exercises: Object.keys(exerciseData).length,
      avgRpe,
      targetHitRate,
      deloadSuggested: deloadCheck.suggest
    });

    const startTime = Date.now();
    const API_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS) || 60000; // 60s default
    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      temperature: 0.3, // Lower temperature for more consistent, data-driven recommendations
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: systemPrompt
    }, {
      timeout: API_TIMEOUT_MS
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

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.claude.parsing(false, `JSON parse error: ${parseError.message}`);
      throw new Error(`Invalid JSON in response: ${parseError.message}`);
    }

    // Validate JSON structure
    if (result.nextWorkout !== undefined && typeof result.nextWorkout !== 'object') {
      logger.claude.parsing(false, `Invalid nextWorkout structure: expected object, got ${typeof result.nextWorkout}`);
      result.nextWorkout = {};
    }
    if (result.nextWorkout && typeof result.nextWorkout === 'object') {
      // Validate each exercise recommendation is an object with weight fields
      for (const [exerciseName, rec] of Object.entries(result.nextWorkout)) {
        if (typeof rec !== 'object' || rec === null) {
          logger.warn('CLAUDE', `Invalid recommendation for ${exerciseName}: expected object, got ${typeof rec}`);
          delete result.nextWorkout[exerciseName];
        }
      }
    }

    logger.claude.parsing(true, { exercises: Object.keys(result.nextWorkout || {}).length });

    // Validate and sanitize AI recommendations
    if (result.nextWorkout) {
      result.nextWorkout = validateRecommendations(result.nextWorkout, exerciseData, session.day);
    }

    return result;
  } catch (error) {
    logger.claude.error(error, { function: 'analyzeWorkout', week: session.week, day: session.day });

    // Build fallback with previous weights from exerciseData
    const fallbackNextWorkout = {};
    for (const [exerciseName, data] of Object.entries(exerciseData)) {
      const rec = { reason: 'Fallback - utrzymaj poprzednie ciezary (blad AI)' };
      for (const set of data.sets) {
        const weight = set.actualWeight || set.targetWeight;
        if (weight && weight > 0) {
          if (set.type === 'heavy') rec.heavy_weight = weight;
          else if (set.type === 'backoff') rec.backoff_weight = weight;
          else if (set.type === 'working') rec.working_weight = weight;
          else if (set.type === 'dropset') rec.dropset_weight = weight;
        }
      }
      if (Object.keys(rec).length > 1) {
        fallbackNextWorkout[exerciseName] = rec;
      }
    }

    logger.warn('CLAUDE', `API failed - returning fallback with ${Object.keys(fallbackNextWorkout).length} exercises`);

    // Return a fallback analysis if API fails
    return {
      analysis: 'Nie udalo sie uzyskac analizy AI. Utrzymaj obecne ciezary i sprobuj ponownie nastepnym razem.',
      exerciseAnalysis: {},
      nextWorkout: fallbackNextWorkout
    };
  }
}

/**
 * Get maximum weekly weight increase based on exercise type
 * Compound exercises: max +5kg, Isolation: max +2kg
 * @param {string} exerciseName - Name of the exercise
 * @returns {number} - Maximum allowed weekly increase in kg
 */
function getMaxWeeklyIncrease(exerciseName) {
  const rule = programRules.exerciseRules?.[exerciseName];
  if (!rule) {
    logger.debug('VALIDATION', `No rule found for ${exerciseName}, using default +5kg cap`);
    return 5; // default safe cap
  }

  // Use progressionStep from rules if available, otherwise fallback to type-based defaults
  // progressionStep is the recommended step, we use it as the max increase
  const maxIncrease = rule.progressionStep || (rule.type === 'compound' ? 5 : 2);
  logger.debug('VALIDATION', `${exerciseName} (${rule.type}): max weekly increase = +${maxIncrease}kg (progressionStep: ${rule.progressionStep || 'default'})`);
  return maxIncrease;
}

/**
 * Validate AI recommendations to prevent hallucinations
 * - Uses HARD CAPS for weight increases: compound +5kg, isolation +2kg
 * - Uses -20% limit for decreases (deload scenarios)
 * - Ensures backoff is 75-90% of heavy weight
 * - Rounds weights to appropriate increments
 * - Filters out set types not allowed for the exercise on the given day
 * @param {Object} recommendations - AI recommendations keyed by exercise name
 * @param {Object} currentData - Current exercise data
 * @param {number} [day] - Optional day number (1, 2, or 3) for SET_CONFIG validation
 */
function validateRecommendations(recommendations, currentData, day = null) {
  const validated = {};

  for (const [exerciseName, rec] of Object.entries(recommendations)) {
    // If day is provided, filter out set types not allowed for this exercise on this day
    if (day !== null) {
      const configKey = `${exerciseName}_${day}`;
      const allowedTypes = EXERCISE_SET_CONFIG[configKey];

      if (allowedTypes) {
        const removedTypes = [];
        // Create a copy to modify
        const filteredRec = { ...rec };

        if (!allowedTypes.includes('heavy') && rec.heavy_weight != null) {
          removedTypes.push(`heavy_weight=${rec.heavy_weight}`);
          delete filteredRec.heavy_weight;
        }
        if (!allowedTypes.includes('backoff') && rec.backoff_weight != null) {
          removedTypes.push(`backoff_weight=${rec.backoff_weight}`);
          delete filteredRec.backoff_weight;
        }
        if (!allowedTypes.includes('working') && rec.working_weight != null) {
          removedTypes.push(`working_weight=${rec.working_weight}`);
          delete filteredRec.working_weight;
        }
        if (!allowedTypes.includes('dropset') && rec.dropset_weight != null) {
          removedTypes.push(`dropset_weight=${rec.dropset_weight}`);
          delete filteredRec.dropset_weight;
        }

        if (removedTypes.length > 0) {
          logger.warn('VALIDATION', `AI hallucination: ${exerciseName} D${day} - removed invalid set types: ${removedTypes.join(', ')}`);
          filteredRec.reason = (filteredRec.reason || '') + ` [Filtered: ${removedTypes.join(', ')} - not valid for D${day}]`;
        }

        // Use filtered rec for further validation
        Object.assign(rec, filteredRec);
      }
    }
    const current = currentData[exerciseName];
    if (!current) {
      validated[exerciseName] = rec;
      continue;
    }

    // Get the current heavy/working weight as baseline
    // Use actualWeight as baseline - what user actually lifted is the true baseline
    // Fall back to targetWeight only if no actual data
    const heavySet = current.sets.find(s => s.type === 'heavy');
    const workingSet = current.sets.find(s => s.type === 'working');
    const baselineWeight = heavySet?.actualWeight || workingSet?.actualWeight || heavySet?.targetWeight || workingSet?.targetWeight || 0;

    // Even with zero baseline, still validate and round weights
    if (baselineWeight === 0) {
      logger.warn('VALIDATION', `${exerciseName}: Zero baseline - applying minimum validation`);
      const validatedRec = { ...rec };
      // Apply Number conversion, rounding and ensure non-negative for all weight types
      if (rec.heavy_weight != null) {
        const val = Number(rec.heavy_weight);
        validatedRec.heavy_weight = isNaN(val) ? null : Math.max(0, roundWeightByExercise(val, exerciseName));
      }
      if (rec.backoff_weight != null) {
        const val = Number(rec.backoff_weight);
        validatedRec.backoff_weight = isNaN(val) ? null : Math.max(0, roundWeightByExercise(val, exerciseName));
      }
      if (rec.working_weight != null) {
        const val = Number(rec.working_weight);
        validatedRec.working_weight = isNaN(val) ? null : Math.max(0, roundWeightByExercise(val, exerciseName));
      }
      if (rec.dropset_weight != null) {
        const val = Number(rec.dropset_weight);
        validatedRec.dropset_weight = isNaN(val) ? null : Math.max(0, roundWeightByExercise(val, exerciseName));
      }
      validated[exerciseName] = validatedRec;
      continue;
    }

    const validatedRec = { ...rec };

    // Get max weekly increase based on exercise type (compound vs isolation)
    const maxAbsoluteIncrease = getMaxWeeklyIncrease(exerciseName);

    // Convert all weight values to Numbers to prevent string comparison bugs
    const heavyWeightNum = rec.heavy_weight != null ? Number(rec.heavy_weight) : null;
    const backoffWeightNum = rec.backoff_weight != null ? Number(rec.backoff_weight) : null;
    const workingWeightNum = rec.working_weight != null ? Number(rec.working_weight) : null;
    const dropsetWeightNum = rec.dropset_weight != null ? Number(rec.dropset_weight) : null;

    // Validate heavy_weight with hard cap
    if (heavyWeightNum !== null && !isNaN(heavyWeightNum)) {
      const maxIncrease = baselineWeight + maxAbsoluteIncrease;  // Hard cap: +5kg compound, +2kg isolation
      const maxDecrease = baselineWeight * 0.80;  // -20% for deload scenarios

      if (heavyWeightNum > maxIncrease) {
        logger.validation.corrected(exerciseName, 'heavy', heavyWeightNum, maxIncrease, `exceeds hard cap (+${maxAbsoluteIncrease}kg max)`);
        validatedRec.heavy_weight = maxIncrease;
        validatedRec.reason = (validatedRec.reason || '') + ` [Skorygowano z ${heavyWeightNum}kg - max +${maxAbsoluteIncrease}kg/tydz]`;
      } else if (heavyWeightNum < maxDecrease) {
        logger.validation.corrected(exerciseName, 'heavy', heavyWeightNum, maxDecrease, 'exceeds -20% deload limit');
        validatedRec.heavy_weight = maxDecrease;
        validatedRec.reason = (validatedRec.reason || '') + ' [Skorygowano - max -20% dla deload]';
      } else {
        validatedRec.heavy_weight = heavyWeightNum;
        logger.validation.approved(exerciseName, 'heavy', heavyWeightNum);
      }
      // Ensure non-negative after rounding
      validatedRec.heavy_weight = Math.max(0, roundWeightByExercise(validatedRec.heavy_weight, exerciseName));
    }

    // Validate backoff_weight (should be 80-85% of heavy per program-rules.json)
    if (backoffWeightNum !== null && !isNaN(backoffWeightNum)) {
      const heavyWeight = validatedRec.heavy_weight || baselineWeight;
      const expectedBackoffMin = heavyWeight * 0.80;  // 80% per program-rules
      const expectedBackoffMax = heavyWeight * 0.85;  // 85% per program-rules

      if (backoffWeightNum < expectedBackoffMin || backoffWeightNum > expectedBackoffMax) {
        // Correct to 82.5% (middle of 80-85% range), without pre-rounding
        const correctedWeight = heavyWeight * 0.825;
        logger.validation.corrected(exerciseName, 'backoff', backoffWeightNum, correctedWeight, 'corrected to 82.5% of heavy (80-85% range)');
        validatedRec.backoff_weight = correctedWeight;
        validatedRec.reason = (validatedRec.reason || '') + ' [Backoff skorygowany do 82.5% heavy]';
      } else {
        validatedRec.backoff_weight = backoffWeightNum;
        logger.validation.approved(exerciseName, 'backoff', backoffWeightNum);
      }
      // Round only once at the end, ensure non-negative
      validatedRec.backoff_weight = Math.max(0, roundWeightByExercise(validatedRec.backoff_weight, exerciseName));
    }

    // Validate working_weight with hard cap
    if (workingWeightNum !== null && !isNaN(workingWeightNum)) {
      // Use actualWeight as baseline - what user actually lifted
      const workingBaseline = workingSet?.actualWeight || workingSet?.targetWeight || baselineWeight;
      const maxIncrease = workingBaseline + maxAbsoluteIncrease;  // Hard cap based on exercise type
      const maxDecrease = workingBaseline * 0.80;  // -20% for deload scenarios

      if (workingWeightNum > maxIncrease) {
        logger.validation.corrected(exerciseName, 'working', workingWeightNum, maxIncrease, `exceeds hard cap (+${maxAbsoluteIncrease}kg max)`);
        validatedRec.working_weight = maxIncrease;
        validatedRec.reason = (validatedRec.reason || '') + ` [Skorygowano z ${workingWeightNum}kg - max +${maxAbsoluteIncrease}kg/tydz]`;
      } else if (workingWeightNum < maxDecrease) {
        logger.validation.corrected(exerciseName, 'working', workingWeightNum, maxDecrease, 'exceeds -20% deload limit');
        validatedRec.working_weight = maxDecrease;
        validatedRec.reason = (validatedRec.reason || '') + ' [Skorygowano - max -20% dla deload]';
      } else {
        validatedRec.working_weight = workingWeightNum;
        logger.validation.approved(exerciseName, 'working', workingWeightNum);
      }
      // Ensure non-negative after rounding
      validatedRec.working_weight = Math.max(0, roundWeightByExercise(validatedRec.working_weight, exerciseName));
    }

    // Validate dropset_weight with hard cap
    if (dropsetWeightNum !== null && !isNaN(dropsetWeightNum)) {
      // Use actualWeight as baseline for dropset (consistent with heavy/working)
      const dropsetSet = current.sets.find(s => s.type === 'dropset');
      const dropsetBaseline = dropsetSet?.actualWeight || dropsetSet?.targetWeight || baselineWeight;
      const maxIncrease = dropsetBaseline + maxAbsoluteIncrease;
      const maxDecrease = dropsetBaseline * 0.80;

      if (dropsetWeightNum > maxIncrease) {
        logger.validation.corrected(exerciseName, 'dropset', dropsetWeightNum, maxIncrease, `exceeds hard cap (+${maxAbsoluteIncrease}kg max)`);
        validatedRec.dropset_weight = maxIncrease;
        validatedRec.reason = (validatedRec.reason || '') + ` [Dropset skorygowany - max +${maxAbsoluteIncrease}kg/tydz]`;
      } else if (dropsetWeightNum < maxDecrease) {
        logger.validation.corrected(exerciseName, 'dropset', dropsetWeightNum, maxDecrease, 'exceeds -20% deload limit');
        validatedRec.dropset_weight = maxDecrease;
        validatedRec.reason = (validatedRec.reason || '') + ' [Dropset skorygowany - max -20% dla deload]';
      } else {
        validatedRec.dropset_weight = dropsetWeightNum;
        logger.validation.approved(exerciseName, 'dropset', dropsetWeightNum);
      }
      // Ensure non-negative after rounding (round only once at end)
      validatedRec.dropset_weight = Math.max(0, roundWeightByExercise(validatedRec.dropset_weight, exerciseName));
    }

    validated[exerciseName] = validatedRec;
  }

  return validated;
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

  // Calculate weekly metrics
  const weeklyAvgRpe = calculateAverageRpe(setLogs);
  const weeklyTargetHitRate = calculateTargetHitRate(setLogs);
  const volumeTrend = calculateWeeklyVolume(previousWeeksData);
  const recurringIssues = extractRecurringIssues([...setLogs, ...previousWeeksData]);
  const deloadCheck = shouldSuggestLightSession(previousWeeksData, { week });

  // Determine block week position (1-4 cycle)
  const blockWeek = ((week - 1) % 4) + 1;
  const nextBlockWeek = blockWeek === 4 ? 1 : blockWeek + 1;
  const nextBlockStrategy = jeffContext.blockStrategy?.[`week${nextBlockWeek}`];

  const userPrompt = `ANALIZA TYGODNIA ${week}
POZYCJA W BLOKU: Tydzien ${blockWeek} z 4
NASTEPNY TYDZIEN BEDZIE: Tydzien ${nextBlockWeek} z 4 ${nextBlockStrategy ? `- ${nextBlockStrategy.focus}` : ''}

METRYKI CALEGO TYGODNIA:
- Srednie RPE: ${weeklyAvgRpe !== null ? weeklyAvgRpe : 'brak danych'}
- Procent osiagnietych celow (reps): ${weeklyTargetHitRate}%
- Trend wolumenu: ${volumeTrend.trend}
- Powtarzajace sie problemy: ${recurringIssues.length > 0 ? recurringIssues.join(', ') : 'Brak'}
${deloadCheck.suggest ? `
UWAGA - ROZWAŻ LIGHT SESSION:
- Powod: ${deloadCheck.reason}
- Powaga: ${deloadCheck.severity}
- Zalecenie: Rozważ zmniejszenie ciezarow o 10-20% w nastepnym tygodniu
` : ''}
DZIEN 1 (Full Body):
${JSON.stringify(weekData.day1, null, 2)}

DZIEN 2 (Upper Body):
${JSON.stringify(weekData.day2, null, 2)}

DZIEN 3 (Lower Body):
${JSON.stringify(weekData.day3, null, 2)}

HISTORIA POPRZEDNICH TYGODNI:
${Object.keys(weeklyTrends).length > 0 ? JSON.stringify(weeklyTrends, null, 2) : 'Brak danych z poprzednich tygodni'}

NOTATKI Z CALEGO TYGODNIA:
${sanitizeUserInput(weekNotes, 1000) || 'Brak notatek'}

DZIENNE ANALIZY AI (wykorzystaj jako kontekst):
${dailyAnalyses.length > 0
  ? dailyAnalyses.map(da => `Dzień ${da.day}: ${da.analysis.analysis || 'Brak analizy'}`).join('\n')
  : 'Brak dziennych analiz'}

Przeanalizuj caly tydzien i zaproponuj strategie na nastepny tydzien.
Wykorzystaj dzienne analizy jako punkt wyjscia - mozesz je potwierdzic, zmodyfikowac lub nadpisac
na podstawie pelnego obrazu tygodnia.
${deloadCheck.suggest ? 'WAZNE: Metryki sugeruja potrzebe light session - rozważ zmniejszone ciezary dla nastepnej sesji.' : ''}
${nextBlockStrategy ? `Pamietaj: Nastepny tydzien to "${nextBlockStrategy.focus}" - ${nextBlockStrategy.approach}` : ''}
Zwroc TYLKO JSON (bez zadnego tekstu przed ani po):
{
  "weekSummary": "3-4 zdania podsumowania tygodnia po polsku",
  "strengths": ["mocne strony tego tygodnia"],
  "improvements": ["obszary do poprawy"],
  "lightSessionSuggested": boolean,
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
    logger.claude.calling('weekly analysis', {
      week,
      sessions: sessions.length,
      avgRpe: weeklyAvgRpe,
      targetHitRate: weeklyTargetHitRate,
      deloadSuggested: deloadCheck.suggest
    });

    const startTime = Date.now();
    const API_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS) || 60000; // 60s default
    const message = await anthropic.messages.create({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: userPrompt
        }
      ],
      system: weeklySystemPrompt
    }, {
      timeout: API_TIMEOUT_MS
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

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      logger.claude.parsing(false, `JSON parse error: ${parseError.message}`);
      throw new Error(`Invalid JSON in weekly response: ${parseError.message}`);
    }
    logger.claude.parsing(true, { days: Object.keys(result.nextWeekRecommendations || {}).length });

    // Validate recommendations for each day
    // Handle both "1" and "day1" formats from AI
    if (result.nextWeekRecommendations) {
      const normalizedRecommendations = {};
      for (const [day, exercises] of Object.entries(result.nextWeekRecommendations)) {
        // Extract numeric day from formats like "1", "day1", "Day1", etc.
        const dayMatch = String(day).match(/(\d+)/);
        const dayNum = dayMatch ? parseInt(dayMatch[1]) : null;

        if (dayNum === null || dayNum < 1 || dayNum > 3) {
          logger.warn('CLAUDE', `Weekly analysis: Skipping invalid day key "${day}"`);
          continue;
        }

        const dayKey = String(dayNum);  // Normalize to "1", "2", "3"
        const dayData = weekData[`day${dayNum}`] || {};
        normalizedRecommendations[dayKey] = validateRecommendations(exercises, dayData, dayNum);
      }
      result.nextWeekRecommendations = normalizedRecommendations;
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
