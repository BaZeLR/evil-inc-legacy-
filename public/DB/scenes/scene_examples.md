# Scene Examples - Different Event Types

## Example 1: Story Event (Planned Quest)

**File**: `DB/scenes/westside_library_001_story.json`

```json
{
  "UniqueID": "westside_library_001_story",
  "Title": "The Mysterious Librarian",
  "Description": "You notice the librarian acting strangely...",
  "Location": "westside_library_001",
  "SceneType": "story",
  "Priority": 90,
  "Trigger": {
    "EventType": "<<On Player Enter First Time>>",
    "RequiredFlags": {
      "quest_herbert_stage": 2,
      "player_knows_psychic_signature": true
    }
  },
  "Media": "Assets/images/scenes/library_mysterious.jpg",
  "Stages": [
    {
      "StageID": "arrival",
      "Text": "As you enter the library, you sense a powerful psychic presence. The librarian behind the desk seems normal, but your mental senses tell a different story.",
      "Media": null,
      "Choices": [
        {
          "ChoiceID": "probe",
          "Text": "Probe her mind telepathically",
          "ShowIf": {
            "StatCheck": {
              "MS": 6
            }
          },
          "NextStage": "probe_success",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "discovered_agent",
              "Value": true
            }
          ]
        },
        {
          "ChoiceID": "approach",
          "Text": "Approach casually and ask for help",
          "NextStage": "casual_approach"
        },
        {
          "ChoiceID": "observe",
          "Text": "Observe from a distance",
          "NextStage": "observation"
        }
      ]
    },
    {
      "StageID": "probe_success",
      "Text": "You gently probe her mind and immediately sense psychic shields - professional ones. She's not what she seems. Her eyes snap to you and she gives a slight nod. 'You're not bad,' she thinks at you. 'Meet me in the archives in five minutes.'",
      "Choices": [
        {
          "ChoiceID": "agree",
          "Text": "Go to the archives",
          "NextStage": "archives_meeting",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "librarian_ally",
              "Value": true
            }
          ]
        },
        {
          "ChoiceID": "decline",
          "Text": "Leave the library",
          "NextStage": "leave",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "missed_librarian_contact",
              "Value": true
            }
          ]
        }
      ]
    },
    {
      "StageID": "archives_meeting",
      "Text": "'I'm Agent Rhodes,' she says quietly. 'We've been monitoring Evil Corp's activities. You're the new psychic they're so interested in, aren't you?' She slides a data chip across the table. 'This might help you. But be careful - they know you're coming.'",
      "Choices": [
        {
          "ChoiceID": "take_chip",
          "Text": "Take the data chip",
          "NextStage": "end_with_chip",
          "Effects": [
            {
              "Type": "CT_ADDTOARRAY",
              "ArrayName": "Inventory",
              "Value": {
                "UniqueID": "data_chip_rhodes_001",
                "Name": "Rhodes Data Chip"
              }
            }
          ]
        }
      ]
    },
    {
      "StageID": "end_with_chip",
      "Text": "You pocket the data chip and nod. 'Thank you.' Agent Rhodes smiles slightly. 'Good luck. You're going to need it.'",
      "Choices": []
    }
  ],
  "Rewards": {
    "OnComplete": {
      "Experience": 75,
      "Flags": {
        "met_agent_rhodes": true,
        "quest_library_complete": true
      }
    }
  }
}
```

---

## Example 2: Random Witness Event (City Life)

**File**: `DB/scenes/downtown_random_witness_001.json`

```json
{
  "UniqueID": "downtown_random_witness_001",
  "Title": "Street Argument",
  "Description": "A heated argument breaks out nearby",
  "Location": "downtown_lc_001",
  "SceneType": "random",
  "Tags": ["witness", "city_life"],
  "Trigger": {
    "EventType": "<<Random>>"
  },
  "Stages": [
    {
      "StageID": "witness",
      "Text": "Two people are arguing loudly on the corner. 'You said the payment would be ready!' shouts one. 'I told you, the boss is late with the shipment!' the other responds. Passersby hurry past, avoiding eye contact.",
      "Choices": [
        {
          "ChoiceID": "intervene",
          "Text": "Try to calm them down",
          "ShowIf": {
            "StatCheck": {
              "MS": 4
            }
          },
          "ChanceSuccess": 60,
          "OnSuccess": "calmed",
          "OnFailure": "provoked"
        },
        {
          "ChoiceID": "listen",
          "Text": "Listen closely to gather information",
          "NextStage": "information"
        },
        {
          "ChoiceID": "ignore",
          "Text": "Keep walking",
          "NextStage": "end"
        }
      ]
    },
    {
      "StageID": "information",
      "Text": "You catch fragments of their conversation - something about a shipment at the docks, Thursday night. Could be useful information.",
      "Choices": [
        {
          "ChoiceID": "continue",
          "Text": "Continue",
          "NextStage": "end",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "overheard_dock_shipment",
              "Value": true
            }
          ]
        }
      ]
    },
    {
      "StageID": "end",
      "Text": "You continue on your way.",
      "Choices": []
    }
  ]
}
```

---

## Example 3: Spicy Random Event

**File**: `DB/scenes/campus_random_spicy_001.json`

```json
{
  "UniqueID": "campus_random_spicy_001",
  "Title": "Flirtatious Encounter",
  "Description": "An attractive student catches your eye",
  "Location": "campus_quad_001",
  "SceneType": "random",
  "Tags": ["spicy", "romance"],
  "Trigger": {
    "EventType": "<<Random>>"
  },
  "Stages": [
    {
      "StageID": "encounter",
      "Text": "A stunningly attractive student sits on a bench, reading. She looks up and catches you staring. Instead of looking away, she smiles invitingly and pats the bench beside her.",
      "Media": "Assets/images/scenes/flirt_bench.jpg",
      "Choices": [
        {
          "ChoiceID": "sit",
          "Text": "Sit down next to her",
          "NextStage": "conversation"
        },
        {
          "ChoiceID": "charm",
          "Text": "Use your psychic charm",
          "ShowIf": {
            "StatCheck": {
              "MS": 5
            },
            "AbilityCheck": "Charm"
          },
          "ChanceSuccess": 70,
          "OnSuccess": "charmed",
          "OnFailure": "rejected"
        },
        {
          "ChoiceID": "walkaway",
          "Text": "Smile politely and walk away",
          "NextStage": "end"
        }
      ]
    },
    {
      "StageID": "conversation",
      "Text": "'I'm Jessica,' she says, her voice soft and playful. 'I haven't seen you around campus before. Are you new?' Her hand brushes against yours as she speaks.",
      "Choices": [
        {
          "ChoiceID": "flirt",
          "Text": "Flirt back",
          "NextStage": "flirt_success",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "met_jessica",
              "Value": true
            }
          ]
        },
        {
          "ChoiceID": "friendly",
          "Text": "Keep it friendly",
          "NextStage": "friend_zone"
        }
      ]
    },
    {
      "StageID": "flirt_success",
      "Text": "You spend the next twenty minutes in pleasant conversation. Jessica writes her number on your hand with a pen. 'Call me sometime,' she says with a wink before walking away, leaving you smiling.",
      "Choices": [
        {
          "ChoiceID": "continue",
          "Text": "Continue",
          "NextStage": "end",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "jessica_number",
              "Value": true
            }
          ]
        }
      ]
    },
    {
      "StageID": "end",
      "Text": "You continue with your day, a slight spring in your step.",
      "Choices": []
    }
  ],
  "Rewards": {
    "OnComplete": {
      "Experience": 10
    }
  }
}
```

---

## Example 4: Combat Scene (with story context)

**File**: `DB/scenes/alley_ambush_001_combat.json`

```json
{
  "UniqueID": "alley_ambush_001_combat",
  "Title": "Dark Alley Ambush",
  "Description": "Someone's been waiting for you...",
  "Location": "backalley_lc_001",
  "SceneType": "combat",
  "Priority": 85,
  "Trigger": {
    "EventType": "<<On Player Enter>>",
    "RequiredFlags": {
      "alley_ambush_triggered": true,
      "quest_herbert_stage": 3
    }
  },
  "Stages": [
    {
      "StageID": "ambush",
      "Text": "As you enter the alley, a figure drops from the fire escape above, blocking your path. 'You've been asking too many questions,' he growls, psychic energy crackling around his fists.",
      "Media": "Assets/images/scenes/alley_ambush.jpg",
      "Choices": [
        {
          "ChoiceID": "fight",
          "Text": "Prepare for combat",
          "NextStage": "combat_start",
          "Effects": [
            {
              "Type": "CT_STARTCOMBAT",
              "EnemyID": "psychic_enforcer_001"
            }
          ]
        },
        {
          "ChoiceID": "talk",
          "Text": "Try to talk him down",
          "ShowIf": {
            "StatCheck": {
              "MS": 7
            }
          },
          "ChanceSuccess": 40,
          "OnSuccess": "talked_down",
          "OnFailure": "combat_start"
        },
        {
          "ChoiceID": "flee",
          "Text": "Try to escape",
          "ChanceSuccess": 30,
          "OnSuccess": "escaped",
          "OnFailure": "combat_start",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "fled_from_enforcer",
              "Value": true
            }
          ]
        }
      ]
    },
    {
      "StageID": "talked_down",
      "Text": "You reach into his mind, finding the fear beneath the bravado. 'They're using you,' you say calmly. 'Just like they used my team. You don't have to do this.' He hesitates, then steps aside. 'Get out of here. I won't report this, but next time I won't have a choice.'",
      "Choices": [
        {
          "ChoiceID": "leave",
          "Text": "Leave quickly",
          "NextStage": "end",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "spared_enforcer",
              "Value": true
            }
          ]
        }
      ]
    },
    {
      "StageID": "end",
      "Text": "You leave the alley, heart pounding.",
      "Choices": []
    }
  ],
  "Rewards": {
    "OnComplete": {
      "Experience": 50,
      "Flags": {
        "alley_ambush_resolved": true
      }
    }
  }
}
```

---

## Example 5: Multi-Path Story Event

**File**: `DB/scenes/hospital_investigation_001_story.json`

```json
{
  "UniqueID": "hospital_investigation_001_story",
  "Title": "Hospital Investigation",
  "Description": "Investigate strange occurrences at Liberty General",
  "Location": "libertygeneralhospital_lc_001",
  "SceneType": "story",
  "Priority": 80,
  "Trigger": {
    "EventType": "<<On Player Enter>>",
    "RequiredFlags": {
      "quest_hospital_unlocked": true,
      "hospital_investigation_active": true
    }
  },
  "Stages": [
    {
      "StageID": "entrance",
      "Text": "Liberty General Hospital is unusually quiet. You've heard reports of patients experiencing strange mental episodes. Time to investigate.",
      "Media": "Assets/images/scenes/hospital_entrance.jpg",
      "Choices": [
        {
          "ChoiceID": "check_records",
          "Text": "Sneak into records room",
          "ShowIf": {
            "StatCheck": {
              "Agility": 3
            }
          },
          "ChanceSuccess": 60,
          "OnSuccess": "records_found",
          "OnFailure": "caught_sneaking"
        },
        {
          "ChoiceID": "talk_nurse",
          "Text": "Talk to the nurse on duty",
          "NextStage": "nurse_conversation"
        },
        {
          "ChoiceID": "scan_minds",
          "Text": "Scan the area telepathically",
          "ShowIf": {
            "StatCheck": {
              "MS": 6
            }
          },
          "NextStage": "psychic_discovery"
        }
      ]
    },
    {
      "StageID": "records_found",
      "Text": "The medical records show a pattern: all affected patients visited the same wing - Experimental Therapy Ward B. That wing is supposedly closed for renovations.",
      "Choices": [
        {
          "ChoiceID": "go_ward_b",
          "Text": "Go to Ward B",
          "NextStage": "ward_b_discovery",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "found_ward_b",
              "Value": true
            }
          ]
        }
      ]
    },
    {
      "StageID": "psychic_discovery",
      "Text": "You extend your mental senses. Fear. Pain. Confusion. All coming from a sealed section of the hospital - Ward B. Someone is conducting experiments on psychics here.",
      "Choices": [
        {
          "ChoiceID": "investigate_ward",
          "Text": "Investigate Ward B",
          "NextStage": "ward_b_discovery",
          "Effects": [
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "sensed_ward_b",
              "Value": true
            }
          ]
        }
      ]
    },
    {
      "StageID": "ward_b_discovery",
      "Text": "Ward B is not under renovation. It's an active research facility. Through a window you see subjects in restraints, electrodes attached to their heads. A familiar logo adorns the equipment: Evil Incorporated.",
      "Media": "Assets/images/scenes/evil_lab.jpg",
      "Choices": [
        {
          "ChoiceID": "break_in",
          "Text": "Break in and free the subjects",
          "NextStage": "rescue_attempt"
        },
        {
          "ChoiceID": "gather_evidence",
          "Text": "Take photos as evidence",
          "NextStage": "evidence_gathered"
        },
        {
          "ChoiceID": "leave",
          "Text": "Leave and report this",
          "NextStage": "report_authorities"
        }
      ]
    },
    {
      "StageID": "evidence_gathered",
      "Text": "You manage to photograph the setup, including the Evil Inc. logos. This is solid proof of illegal experimentation. But as you turn to leave, an alarm sounds.",
      "Choices": [
        {
          "ChoiceID": "run",
          "Text": "Run!",
          "ChanceSuccess": 50,
          "OnSuccess": "escaped_with_evidence",
          "OnFailure": "caught_with_evidence"
        }
      ]
    },
    {
      "StageID": "escaped_with_evidence",
      "Text": "You make it out before security arrives. The evidence is safely stored in your com unit. This could blow the lid off Evil Inc.'s operations.",
      "Choices": []
    }
  ],
  "Rewards": {
    "OnComplete": {
      "Experience": 100,
      "Flags": {
        "hospital_investigation_complete": true,
        "has_evil_corp_evidence": true
      }
    }
  }
}
```

---

## Example 6: Simple Random Story Event

**File**: `DB/scenes/downtown_random_story_001.json`

```json
{
  "UniqueID": "downtown_random_story_001",
  "Title": "Mysterious Package",
  "Description": "You find an abandoned package",
  "Location": "downtown_lc_001",
  "SceneType": "random",
  "Tags": ["story", "mystery"],
  "Trigger": {
    "EventType": "<<Random>>"
  },
  "Stages": [
    {
      "StageID": "discovery",
      "Text": "You notice a small package left on a bench. It has no address, just a symbol - a circle with three radiating lines. The same symbol you saw in your dreams.",
      "Choices": [
        {
          "ChoiceID": "open",
          "Text": "Open the package",
          "NextStage": "opened"
        },
        {
          "ChoiceID": "scan",
          "Text": "Scan it with your powers first",
          "ShowIf": {
            "StatCheck": {
              "MS": 4
            }
          },
          "NextStage": "scanned"
        },
        {
          "ChoiceID": "ignore",
          "Text": "Leave it alone",
          "NextStage": "end"
        }
      ]
    },
    {
      "StageID": "opened",
      "Text": "Inside is a data chip and a note: 'They're watching. Trust no one. The truth is at coordinates 40.7128° N, 74.0060° W.' The handwriting is familiar, but you can't place it.",
      "Choices": [
        {
          "ChoiceID": "take",
          "Text": "Take the chip and note",
          "NextStage": "end",
          "Effects": [
            {
              "Type": "CT_ADDTOARRAY",
              "ArrayName": "Inventory",
              "Value": {
                "UniqueID": "mysterious_chip_001",
                "Name": "Mysterious Data Chip"
              }
            },
            {
              "Type": "CT_SETVARIABLE",
              "VarName": "has_coordinates",
              "Value": true
            }
          ]
        }
      ]
    },
    {
      "StageID": "end",
      "Text": "You continue on your way, mind racing with questions.",
      "Choices": []
    }
  ],
  "Rewards": {
    "OnComplete": {
      "Experience": 25
    }
  }
}
```

---

## Key Differences Summary

| Type | Purpose | Location Specific | Repeatable | Priority | Conditions |
|------|---------|------------------|------------|----------|------------|
| **Story** | Main quest progression | Yes | Usually No | High (80-100) | RequiredFlags |
| **Combat** | Boss fights with story | Yes | Usually No | High (80-90) | RequiredFlags |
| **Witness** | Atmosphere, world-building | Yes | Yes | Low | None/Random |
| **Spicy** | Adult content moments | Yes | Yes | Low | None/Random |
| **Story Random** | Mystery, plot hints | Yes | Yes | Medium | None/Random |

## Tips for Each Type

### Story Events
- Always use RequiredFlags
- Set Priority 80-100
- Include multiple paths
- Provide meaningful rewards
- Mark as non-repeatable (default)

### Combat Scenes
- Include story context
- Offer alternatives (flee, talk down)
- Reference specific enemy IDs
- Explain why combat started

### Witness Events
- Keep brief (1-3 stages)
- No flags required
- Can be completely passive
- Add world flavor

### Spicy Events
- Mark with "spicy" tag
- Include opt-out choice
- Can lead to relationships
- Track encounters with flags if repeatable

### Story Random
- Plant plot seeds
- Can reference main story
- Include mystery elements
- May unlock future quests
