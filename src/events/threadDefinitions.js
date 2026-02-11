export const THREAD_DEFINITIONS = [
  {
    id: 'prologue',
    name: 'Prologue',
    autoAdvance: true,
    events: [
      {
        id: 'intro_start',
        scene: 'evilinc_intro_001_sequence',
        trigger: { type: 'player_enter_first', room: 'evilincfront_lc_001' },
        condStr: 'player.Stats.prologue_intro_skipped != true'
      },
      {
        id: 'ei_reception_1',
        scene: 'evilreception_penny_001_sequence',
        trigger: { type: 'player_enter_first', room: 'evilreception_lc_001' }
      },
      {
        id: 'dr_interview_1',
        scene: 'drevilscommandcenter_drevil_001_sequence',
        trigger: { type: 'manual' }
      },
      {
        id: 'dr_test',
        scene: 'E.I_CC_Player_Job_Test',
        trigger: { type: 'manual' }
      },
      {
        id: 'dr_joining',
        scene: 'drevilscommandcenter_drevil_002_sequence',
        trigger: { type: 'manual' }
      },
      {
        id: 'dr_asks',
        scene: 'drevilscommandcenter_drevil_ask_001_story',
        trigger: { type: 'manual' }
      },
      {
        id: 'player_apartment',
        scene: 'apartment_player_001_sequence',
        trigger: { type: 'player_enter_first', room: 'apartment_player_001' }
      },
      {
        id: 'winifred_encounter',
        scene: 'apartment_winifred_001_sequence',
        trigger: { type: 'player_enter_first', room: 'appartmentlobby_lc_001' }
      },
      {
        id: 'ei_reception_2',
        scene: 'evilreception_penny_002_sequence',
        trigger: { type: 'player_enter', room: 'evilreception_lc_001' }
      },
      {
        id: 'briefing',
        scene: 'evilinc_securitycenter_001_sequence',
        trigger: { type: 'player_enter_first', room: 'evilincsecuritylevel_lc_001' }
      },
      {
        id: 'vadar_office_talk',
        scene: 'evilinc_securitycenter_002_sequence',
        trigger: { type: 'player_enter_first', room: 'evilinc_vadar_office_lc_001' }
      },
      {
        id: 'personal_lab',
        scene: 'evilinc_lab_intro_001_sequence',
        trigger: { type: 'player_enter_first', room: 'evilinc34thfloor_lc_001' }
      },
      {
        id: 'hospital_intro',
        scene: 'hospital_intro_001_sequence',
        trigger: { type: 'player_enter_first', room: 'libertygeneralhospital_lc_001' }
      },
      {
        id: 'prologue_complete',
        scene: 'prologue_complete_001_sequence',
        trigger: { type: 'player_enter_first', room: 'road22_lc_001' }
      }
    ]
  }
];
