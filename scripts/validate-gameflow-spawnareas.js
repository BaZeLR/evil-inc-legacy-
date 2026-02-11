// Validates that every NPC in the GameflowMainEvents capture list exists and has the expected SpawnAreas.
// Usage: node scripts/validate-gameflow-spawnareas.js

const fs = require('fs');
const path = require('path');

const expected = [
  // Liberty City East
  ['nerd_001', 'Liberty City East'],
  ['young_super_d_001', 'Liberty City East'],
  ['biker_b_001', 'Liberty City East'],
  ['happy_grandpa_001', 'Liberty City East'],
  ['powerful_ceo_001', 'Liberty City East'],

  // Liberty City West
  ['young_super_c_001', 'Liberty City West'],
  ['jogger_001', 'Liberty City West'],
  ['biker_a_001', 'Liberty City West'],
  ['bikini_babe_001', 'Liberty City West'],

  // Liberty City General
  ['old_doctor_001', 'Liberty City General'],
  ['female_doctor_001', 'Liberty City General'],
  ['nurse_a_001', 'Liberty City General'],
  ['nurse_b_001', 'Liberty City General'],
  ['med_student_001', 'Liberty City General'],
  ['hospital_adm_001', 'Liberty City General'],
  ['janitor_001', 'Liberty City General'],

  // Liberty University Campus
  ['student_a_001', 'Liberty University Campus'],
  ['student_b_001', 'Liberty University Campus'],
  ['prof_001', 'Liberty University Campus'],
  ['college_coed_001', 'Liberty University Campus'],
  ['young_super_a_001', 'Liberty University Campus'],
  ['visiting_parent_a_001', 'Liberty University Campus'],
  ['visiting_parent_b_001', 'Liberty University Campus'],

  // Liberty University Library
  ['nervous_student_001', 'Liberty University Library'],
  ['bookworm_001', 'Liberty University Library'],
  ['librarian_001', 'Liberty University Library'],
  ['student_c_001', 'Liberty University Library'],
  ['student_d_001', 'Liberty University Library'],
  ['young_super_b_001', 'Liberty University Library'],
  ['college_protester_001', 'Liberty University Library'],

  // Liberty University Gym
  ['athlete_a_001', 'Liberty University Gym'],
  ['athlete_b_001', 'Liberty University Gym'],
  ['swimmer_001', 'Liberty University Gym'],
  ['yoga_instructor_001', 'Liberty University Gym'],
  ['female_body_builder_001', 'Liberty University Gym'],
  ['basketball_coach_001', 'Liberty University Gym'],
  ['volleyball_captain_001', 'Liberty University Gym'],

  // Apartment Building
  ['hot_neighbor_001', 'Apartment Building'],
  ['cute_neighbor_001', 'Apartment Building'],
  ['high_neighbor_001', 'Apartment Building'],
  ['fud_ex_driver_001', 'Apartment Building'],
  ['scary_drug_dealer_001', 'Apartment Building'],
  ['married_neighbor_001', 'Apartment Building'],
  ['landlord_001', 'Apartment Building'],

  // Liberty City Mall
  ['young_shopper_001', 'Liberty City Mall'],
  ['happy_family_001', 'Liberty City Mall'],
  ['security_guard_001', 'Liberty City Mall'],
  ['milf_001', 'Liberty City Mall'],
  ['young_couple_001', 'Liberty City Mall'],
  ['food_vendor_001', 'Liberty City Mall'],
  ['gold_digger_001', 'Liberty City Mall'],
];

function normalizeStr(value) {
  return String(value ?? '').trim();
}

function getSpawnAreas(character) {
  if (Array.isArray(character?.SpawnAreas)) {
    return character.SpawnAreas.map(normalizeStr).filter(Boolean);
  }
  if (typeof character?.SpawnArea === 'string') {
    const v = normalizeStr(character.SpawnArea);
    return v ? [v] : [];
  }
  return [];
}

function main() {
  const base = path.join(process.cwd(), 'public', 'DB', 'characters', 'r_citizens');
  const problems = [];

  for (const [id, area] of expected) {
    const fp = path.join(base, `${id}.json`);
    if (!fs.existsSync(fp)) {
      problems.push({ id, area, issue: 'missing_file' });
      continue;
    }

    let json;
    try {
      json = JSON.parse(fs.readFileSync(fp, 'utf8'));
    } catch (e) {
      problems.push({ id, area, issue: 'invalid_json', error: String(e) });
      continue;
    }

    const spawnAreas = getSpawnAreas(json);
    if (spawnAreas.length === 0) {
      problems.push({ id, area, issue: 'missing_spawn_area' });
      continue;
    }

    const ok = spawnAreas.some((v) => v.toLowerCase() === area.toLowerCase());
    if (!ok) {
      problems.push({ id, area, issue: 'wrong_spawn_area', found: spawnAreas });
    }
  }

  if (problems.length === 0) {
    console.log('OK: all listed NPCs exist and have correct SpawnAreas');
    return;
  }

  console.log('PROBLEMS:', JSON.stringify(problems, null, 2));
  process.exitCode = 2;
}

main();
