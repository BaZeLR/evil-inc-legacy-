const cmd = (cmdtype, { text = '', part2 = '', part3 = '', part4 = '' } = {}) => {
  const node = { cmdtype };
  if (text !== '') node.CommandText = text;
  if (part2 !== '') node.CommandPart2 = part2;
  if (part3 !== '') node.CommandPart3 = part3;
  if (part4 !== '') node.CommandPart4 = part4;
  return node;
};

const check = (CondType, ConditionStep2 = '', ConditionStep3 = '', ConditionStep4 = '', CkType = 'CT_Uninitialized') => ({
  CondType,
  CkType,
  ConditionStep2,
  ConditionStep3,
  ConditionStep4
});

const cond = (conditionname, Checks = [], PassCommands = [], FailCommands = []) => ({
  conditionname,
  Checks,
  PassCommands,
  FailCommands
});

const display = text => cmd('CT_DISPLAYTEXT', { text });
const pic = part2 => cmd('CT_DISPLAYPICTURE', { part2 });
const pause = () => cmd('CT_PAUSEGAME');
const setVar = (part2, part3, part4) => cmd('CT_SETVARIABLE', { part2, part3, part4 });
const addChoice = (part2, text) => cmd('CT_ACTION_ADD_CUSTOMCHOICE', { part2, text });
const removeChoice = (part2, text) => cmd('CT_ACTION_REMOVE_CUSTOMCHOICE', { part2, text });

function buildChatAction() {
  const strikeConversation = cond(
    'Strike up a conv',
    [check('CT_AdditionalDataCheck', 'Strike up a conversation')],
    [
      display('[c 128,128,255][i]<God, I dont know if I should talk to her what If she is a super? Shit! Your staring at her has gotten you noticed. Quick Look away! Oh shit oh shit oh shit! Why am I such a loser around girls? Grrrr get it together man!>[/i][/c]<br>'),
      pause(),
      display(
        'In a panic and horrified at the sight the the cute college coed your heart begins to race. The cafe is partially full and you take a seat adjacent of the young lady. You finally gather enough courage to  take a closer look at her...  Only to find her smiling and looking straight at you. Your little panic attack was definitely noticed by her and a few other customers.<br><br>" Hey, are you ok, you look a little out of it.....uhhhh.... never mind..." She goes back to reading her magazine but a smile crosses her lips. Smiling back she looks up and you say more relaxed this time. "Oh yeah I am fine just a little migraine hit me and now its gone..."<br><br>"Ummm. OK, well thats good.....so your done tweaking out then? I really dont need any extra attention right now..." she says rolling her eyes. Embarrassed you look away and she returns to her magazine.<br>'
      ),
      pic('Katie-Cafe002.jpg'),
      pause(),
      display(
        '"....so....... what is your name?"  She lets out a sigh but looks back at you. "Whats yours?" she shoots back at you with a cute look.<br><br>"Steven Wolf."<br><br>"Katie Aaron."<br><br>Remembering the cry for help upon entering the cafe you ask the girl. "Is everything ok? Are you in some sort of trouble?" Trying to sound as concerned as possible.. "Look I just met you. and if you dont mind I would like to get back to reading my mag. No offense...."<br>'
      ),
      pic('Katie-Cafe000.jpg'),
      removeChoice('Chr:Katie:Chat', 'Strike up a conversation'),
      addChoice('Chr:Katie:Chat', 'Get to know her')
    ],
    []
  );

  const getToKnowHer = cond(
    'Get to know her',
    [check('CT_AdditionalDataCheck', 'Get to know her')],
    [
      display(
        '"So are you from around here?"  Katie flips through her magazine. Then in a big huff she closes it then plops it down on the rustic coffee table in front of you both.  "Uhhhhhhh!" Katie sighs. She crosses her arms  and looks around the little shop. In a annoyed tone responds "No. I just started at Liberty University this last fall., not that it matters anymore..... Sorry  its nothing.....I was  just lost in thought there for a minute. I do not mean to be rude but I am kind of busy so if you do not mind..."<br><br>"Oh well....Do not worry about it. That.... ummm....magazine looks real important....I will just let you get back to it.....sorry...."  This was not a big deal, girls...  usually want nothing to do with you and you have heard worse excuses than that. At least she was kind of being nice about it. It was at that exact moment however Katie realized what you were thinking and looked sorry.<br>'
      ),
      pause(),
      display(
        'She looks away then down at her feet "I am sorry I am not trying to be a bitch I am just going through some hard times. I am trying to hide from my landlord, he is looking for me.and dont get me started with school...."<br><br>"You go to the University? What do you study?"<br><br>"[c Fuchsia]Advanced Neurological Cybernetics.[/c] The brain is much more powerful than we believe. Before the great discharge the human race was on the verge of  a huge break through! But because of the incident we lost a lot. I want to be the one who discovers what the new and takes it forward in to the future..... Well I did before the...the......never mind. I guess now it does not matter anymore."<br><br>'
      ),
      addChoice('Chr:Katie:Chat', 'Is there something wrong with school?'),
      addChoice('Chr:Katie:Chat', 'Are you sure your ok?'),
      removeChoice('Chr:Katie:Chat', 'Get to know her')
    ],
    []
  );

  const lostThings = cond(
    'I heard you lost some things...',
    [check('CT_AdditionalDataCheck', 'I heard you lost some things...')],
    [
      display(
        '"Wha...? How did you know that? " Katie says dumbfounded. She had not told anybody about her locker.<br><br>"Th....The security guard and I are on good terms. He mentioned it the other day. [c 128,128,255][i]< You say lying as fast as you can, you cant reveal your secrets just yet> [/i][/c] "We, uhhh are old friends....."<br><br>"Your friend swith Herbert? Ehhhewww..... Well I will try not to hold that against you. But yeah someone broke into my gym locker while I was swimming in the schools pool. They took all my clothes, cell phone, even my mother is locket. I reported it to your "buddy" Herbert, but said there was nothing he could do. For fuck sakes why do we have a security guard if he cant even protect us?"<br><br>"I could look into it if you want."<br><br>"I doubt there is any hope but I wont stop you. Thanks Stevie...."<br><br>[middle][c Fuchsia][b]NEW QUEST[/b][/c]<br>Find Katie is belongings.<br>[/middle]'
      ),
      setVar('Obj002', 'Equals', '1'),
      addChoice('Obj:Com Unit:Objectives', 'Katies Quest'),
      removeChoice('Chr:Katie:Chat', 'I heard you lost some things...'),
      removeChoice('Chr:Katie:Chat', 'Is there something wrong with school?'),
      cond(
        'herb beaten',
        [check('CT_Variable_Comparison', 'herbert talk', 'Less Than', '4')],
        [
          addChoice('Chr:Herbert-Campus Security:Talk', '(Honest) Im here to see the progress of a B&E.')
        ],
        [
          addChoice('Chr:Herbert-Campus Security:Talk', 'Katie\'s Things')
        ]
      )
    ],
    []
  );

  const schoolProblem = cond(
    'Is there something wrong with school?',
    [check('CT_AdditionalDataCheck', 'Is there something wrong with school?')],
    [
      display(
        '"Its nothing really I...I...I am having a really hard time paying for everything. In the beginning I was fine... Its just that the only reason I could afford college is because I received a full ride for the women is rugby team. Then right after I started school the [i][c Fuchsia]Justice Force [/c][/i]was battling Electrode. They ended up fighting on the our practice field and totally destroyed everything. Without the field, there is no team. No team.... No scholarship...."<br><br>"Oh wow well I am sorry to hear that Katie."<br><br>"Fucking [c Fuchsia][i]Justice Force[/i][/c] thanks for nothing.....Sorry I just need to find a job."<br> '
      )
    ],
    []
  );

  const areYouOk = cond(
    'Are you sure your ok?',
    [
      check('CT_Variable_Comparison', 'katie var001', 'Equals', '1'),
      check('CT_AdditionalDataCheck', 'Are you sure your ok?', '', '', 'And')
    ],
    [
      display(
        '"Well since we are friends I guess I can tell you. Im a T.A. for Professor Star up at Liberty U. She caught me .....uhhh stealing.....money out of her desk. "<br><br>"Well that was not smart Katie......"<br><br>"I know I know! It is just that my student loans did not come through and I am already strapped for cash I can barley get by. I saw that bitch leave a envelope full of cash in her desk. So then she fired me and now I have to work another job just to barley get by. It is not fair she was getting paid so much for sitting on her old ass and I was doing all the work! There was so much I figured she should not miss a few bills but I guess I kind of got too greedy....."<br><br>" Well she eventually caught me, then fired me. Prof Star also threatened to turn me into the dean if I did not pay her back the money I took! I am worried that if I get kicked out of school I will have to move back in with my step dad..... I just could not go through that again!  I just did not know what I am was going to do. I had already spent all the money on school and back rent ......  Then I heard about this guy down at the Uranus Lounge. He loans out money then lets the girls pay it back by dancing as well as other things....."<br><br>Katie\'s eyes swell and a tear forms in the corner. Fighting to hold back, a single tear breaks  through and leaves a streak down her cheek.<br>'
      ),
      pause(),
      display(
        '"A loan shark...?"<br><br>Katie blushes and looks away ashamed.. You can tell she is not happy about it. " I got the money from Manny to pay Professor Star back but then my car broke down and that cost a ton, to get it fixed. Then my land lord threatened to throw me out if I did not pay him more of the rent I owe. Putting me back even further than where I was. He is actually looking for me right now.... Well anyway, after the first week of working there I was just dancing and waiting tables. Lately they have been trying to push me to do "other" stuff. I really cant say no.... the interest on my debt keeps growing...... I know you just helped me out and all but do something about both of them? I really dont want to be kicked out of school and there is no way I can come up with the cash and continue to live......"<br><br>"I will see what I can do Katie. But in the mean time I want you to go to this address and give them this card.  You hand her a business card for E.I. "I work here and we are currently looking for fresh young talent like yourself."<br><br>"But what kind of work is it?" She reaches out and takes the card from your hand and just stares at it.<br>'
      ),
      pause(),
      setVar('E.I. Scientist', 'Add', '1'),
      display(
        '"The [b]PAYING[/b] kind......Look I am trying to do you a favor so please just give it a shot. You seem smart and I think you would make a great asset to the team." She looks away then back at your face. "  I cant quit the lounge just yet...I kind of still owe the  loan shark a lot of money. This is so embarrassing I just cant seem to get myself out of these debts....." <br><br>" I will go there right away...Thanks Steven I really needed someone to help...."<br><br>[middle][c Fuchsia][b]NEW QUEST[/b][/c]<br>[b]Katie\'s Quest - Paying back the Professor[/b]<br><br>[middle][c Fuchsia][b]NEW QUEST[/b][/c]<br>[b]Katie\'s Quest - Loan Shark Problem[/b]<br><br>"But uhh do you mind If I ask you something?"<br>'
      ),
      pause(),
      display(
        '"The other day when we met you mentioned you heard my stuff was stolen. Who told you? You said Herbert but I never even told him....So how could you have known...?"<br><br>"Well I...I..." [c 128,128,255]<Oh shit has she figured me out?>[/c]<br><br>Katie once again leans in close and asks "[c 128,128,255]Can you read minds[/c]?" "What me? No way? What the? Why Would you even assume...?" "Because all I did was mouth the words and think the question , [i]Can you read minds[/i]. Kind of gave your self away boss..."<br><br>[c 128,128,255][b]<FUCK!>[/b][/c]<br><br>'
      ),
      pause(),
      display(
        '"Look I can read minds..other things too.....but you cant tell anybody...!"<br><br>"Like wow! Really? I KNEW IT I KNEW IT I KNEW IT! YES! You have to let me scan your brain! Oh please please please!" She squeals excited like a child on Christmas morning. "You want to scan my brain? Why?"<br><br>"Are you serious? Out of all the meta humans that have appeared Psychic\'s are one of the rarest. There is almost nothing  known about your type of powers or limits! Geeze! Your brain could unlock the next stage of human evolution for us all!"<br><br>"Look keep your voice down! The only people that know about my ability are Dr. Evil and his clone knows back at E.I."<br><br>"If you promise to keep quiet I will let you have your brain scan and whatever test you have for me. Deal?"<br><br>"DEAL!!! OMG this is so great! I cant wait to get started!"<br>'
      ),
      pause(),
      display(
        "[i]<Unlocking Katie's Research lets you [c Fuchsia][b]permanently reprogram [/b][/c]people you have captured and brought back to your lab. Once someone undergoes treatment they can never go back.... Just speak with Katie in your Lab with the character also in the lab to under go reprogramming.>[/i]<br><br>Beep beep beep Katie's phone rings.<br><br>\"Holy Shit there is a super attack going on over in the Harbor District. Reports are saying someone name [b]Cain[/b]... But I have some free time if you wanna hang out with me....\"<br>"
      ),
      removeChoice('Chr:Katie:Chat', 'Are you sure your ok?'),
      cmd('CT_SETCHARACTION', { part2: 'Prof. Star', part3: 'Talk-Active' }),
      setVar('katie var001', 'Equals', '2'),
      addChoice('Obj:Com Unit:Objectives', 'Katie\'s Quest : The Loan Shark'),
      addChoice('Obj:Com Unit:Objectives', 'Katie\'s Quest : Paying back the professor. '),
      setVar('Obj006', 'Equals', '1'),
      setVar('Obj007', 'Equals', '1'),
      cmd('CT_SETROOMACTION', { part2: '17d7da7d-bfe7-4a35-bb0e-060f299ea526', part3: 'Search for some trace of Xander Cain-Active' }),
      cmd('CT_SETEXIT', { part2: 'f2117f55-13a0-4151-811d-fd3c9dabfc17', part3: "East-Active-To:Professors Star's Office" }),
      addChoice('Timer:Give Orders:<<On Each Turn>>', 'Katie- Blow Job & Fuck')
    ],
    []
  );

  const profStarComplete = cond(
    'I took care of your little problem...Star',
    [
      check('CT_AdditionalDataCheck', 'I took care of your little problem with Prof Star'),
      check('CT_Variable_Comparison', 'katie var001', 'Greater Than or Equals', '3', 'And'),
      check('CT_Character_In_Room', 'Katie', '00000000-0000-0000-0000-000000000001', '', 'And')
    ],
    [
      display(
        '"Hey Katie its nice to see you here. How do you like it at E.I.?" Admiring the cute brunet gorgeous body.<br><br>"Like it? I Love it! Mr. Vadar is like the coolest guy ever!!!! Thank you soooo much for getting me this job.I did not know you were such a big shot around here. I do not know how I will ever thank you. " "Well I have a special assignment coming up, and I will definitely need some help, can I count you in?"<br><br>"Absolutely boss!" "I wanted to let you know I was able to take care of the whole money thing with Star. She wont bring it up ever again." <br><br>[middle][c Red][b]QUEST COMPLETE[/b][/c]<br>Katie\'s Quest - Paying back the Professor[/middle]<br><br>[b][middle]You\'ve gained 200 Experience Points![/middle][/b]<br>'
      ),
      pic('Katie-001.jpg'),
      addChoice('Chr:Katie:Chat', 'Katie - Wanna get Lunch?'),
      removeChoice('Obj:Com Unit:Objectives', "Katie's Quest : Paying back the professor. "),
      removeChoice('Chr:Katie:Chat', 'I took care of your little problem with Prof Star'),
      setVar('Player Exp', 'Add', '200')
    ],
    []
  );

  const loanComplete = cond(
    'Took care of your other problem...Loan',
    [
      check('CT_AdditionalDataCheck', 'I took care of your other problem...Loan'),
      check('CT_Variable_Comparison', 'katie var001', 'Greater Than or Equals', '3', 'And')
    ],
    [
      display(
        '"Hey Katie its nice to see you here. How do you like it at E.I.?" Admiring the cute brunet gorgeous body.<br><br>"Like it? I Love it! Mr. Vadar is like the coolest guy ever!!!! Thank you soooo much for getting me this job.I did not know you were such a big shot around here. I do not know how I will ever thank you. " "Well I have a special assignment coming up, and I will definitely need some help, can I count you in?"<br><br>"Absolutely boss!" "I wanted to let you know I was able to take care of the whole money thing with Star. She wont bring it up ever again." <br><br>[middle][c Red][b]QUEST COMPLETE[/b][/c]<br>Katie\'s Quest - Paying back the Professor[/middle]<br><br>[b][middle]You\'ve gained 200 Experience Points![/middle][/b]<br>'
      )
    ],
    []
  );

  const chain = cond(
    'Strike up a conversation',
    strikeConversation.Checks,
    strikeConversation.PassCommands,
    [
      cond(
        getToKnowHer.conditionname,
        getToKnowHer.Checks,
        getToKnowHer.PassCommands,
        [
          cond(
            lostThings.conditionname,
            lostThings.Checks,
            lostThings.PassCommands,
            [
              cond(
                schoolProblem.conditionname,
                schoolProblem.Checks,
                schoolProblem.PassCommands,
                [
                  cond(
                    areYouOk.conditionname,
                    areYouOk.Checks,
                    areYouOk.PassCommands,
                    [
                      cond(
                        profStarComplete.conditionname,
                        profStarComplete.Checks,
                        profStarComplete.PassCommands,
                        [
                          loanComplete
                        ]
                      )
                    ]
                  )
                ]
              )
            ]
          )
        ]
      )
    ]
  );

  return {
    name: 'Chat',
    bActive: true,
    InputType: 'Custom',
    CustomChoiceTitle: 'What to you say to her?',
    CustomChoices: ['Strike up a conversation'],
    Conditions: [chain],
    PassCommands: [],
    FailCommands: []
  };
}

function buildExamineAction() {
  return {
    name: 'Examine',
    bActive: true,
    InputType: 'None',
    PassCommands: [
      cmd('CT_DISPLAYCHARDESC', { part2: 'Katie' }),
      cond(
        'katie 3',
        [check('CT_Character_In_Room', 'Katie', '229df7e1-f204-44a0-9807-19e1429a398d', '2')],
        [pic('Katie-001.jpg')],
        [
          cond('cafe', [check('CT_Character_In_Room', 'Katie', '229df7e1-f204-44a0-9807-19e1429a398d', '2')], [pic('Katie-School Girl.jpg')], [])
        ]
      )
    ],
    FailCommands: []
  };
}

function buildReturnItemsAction() {
  return {
    name: 'Return Items',
    bActive: false,
    InputType: 'None',
    PassCommands: [
      display(
        '"Hey Katie I have some good news!" Looking over at Katie she is sitting in her usual spot. "Oh hey Stevie! Whats the news?" She looks up at you from her magazine.<br><br>"SOOOOO.. I was able to find your things!"<br><br>"WHAT!? REALLY? My mothers locket and everything? Where did you find them? "<br><br>"I cant say, just do not bring anything valuable to the gym lockers any more ok." "Uhhh ya no prob! Thank you sooooo much Steve! This is the only thing I have left of my mother.This means so much to me!" She jumps up from the chair and gives you a big hug. Her pert tits must have been pretty cold for her nipples were like daggers diving into you. Not that you minded...<br><br>[middle][c Fuchsia][b]Katie\'s Quest Completed![/b][/c][/middle]<br><br>[middle][b]You received 100 Experience Points![/b][/middle]'
      ),
      cmd('CT_MOVEITEMTOCHAR', { part2: 'cd6f30fc-4818-4490-b450-3b8cd1dfb202', part3: 'Katie' }),
      cmd('CT_SETCHARACTION', { part2: 'Katie', part3: 'Return Items-Inactive' }),
      setVar('katie var001', 'Equals', '1'),
      setVar('katie fuck cafe', 'Equals', '0'),
      removeChoice('Obj:Com Unit:Objectives', 'Katies Quest'),
      setVar('Player Exp', 'Add', '100')
    ],
    FailCommands: []
  };
}

function buildReprogramAction() {
  return {
    name: 'Reprogram',
    bActive: false,
    InputType: 'Custom',
    CustomChoiceTitle: 'Who?',
    CustomChoices: [],
    FailCommands: [
      display('Katie can only reprogram ia subject n your private lab.<br>')
    ],
    PassCommands: [
      pic('reprogramming-01.png'),
      cond(
        'Ginna',
        [
          check('CT_Character_In_Room', 'Officer Ginna Hill', '3d36449b-fb56-4ed2-b5d6-e3f69c236586', ''),
          check('CT_AdditionalDataCheck', 'Officer Ginna', '', '', 'And'),
          check('CT_Variable_Comparison', 'ginna reprogramed', 'Equals', '0', 'And')
        ],
        [
          display(
            '"Well well, Katie looks like we have someone to test your reprogramming on! Say hello to Officer Ginna HIll! Our newest mole in LCPD!!! " <br><br>"Ha! Well I can see two obvious reasons you choose her! But I am still excited to test my research!" Lets have her lay down on the bed!" She motions to the strange bed in front of you. <br><br>You bring Ginna over and lay her down." Now how exactly does this work Katie?" You ask curiously. <br>'
          ),
          pic('reprogramming-02.png'),
          pause(),
          display(
            '" You put her in another hypnotic state and we lay her down and hook up the machine! The machine downloads all of her memories. Plus personality traits that make the subject who they are. From this display here..." Katie motions to the green holographic display in front of the machine. "We will be able to look at that data and modify it however we please. Once we have the subjects new memories and traits uploaded. My device reintegrate them with the subject completely over writing the subject is original data!"<br><br>"That sounds amazing Katie! How long does it last?" "Thats the best part! While I was studying the scans I took of your brain I was able to figure out how to make the changes permanent. With no cost to your powers! Well in theory anyway. I still have to iron out some bugs here and there and I am glad to see you brought me a test subject. "<br>Katie points to the cop trapped in your containment field.<br><br>The effects of your orders have wore off and now she was furiously screaming and pounding on the fields wall. Her blurry punches against the force field gets her nowhere. "It is a good thing the containment cell can take a whole lot more that she can dish out!"<br><br>"Well, Lets move her to the station shall we."<br>'
          ),
          pause(),
          display(
            'You press a few buttons and the entire containment cell lights up. Electricity zapping the hell out of Ginna before she collapses to the floor unconscious.<br><br>You have Yes Man pick her up and restrain her while both you and Katie hook her up to the device.  "Are you sure these restraints will hold her? She is a Super after all." They... should the   .....but just in case. We might want to have Yes Man stand close to her if anything happens.... and maybe we should take a few steps back..."  Her hand goes to the machine. "Device start scanning!"<br>'
          ),
          pause(),
          pic('reprogramming-03.png'),
          display(
            '[c 191,191,128][b]Downloading.<br><br>Downloading...<br><br>Downloading......<br><br>Downloading.<br><br>Downloading...<br><br>Downloading......<br><br>Downloading.<br><br>Downloading...<br><br>Downloading......[/c]<br><br>%100  Complete![/b] '
          ),
          pause(),
          display(
            '"YES! It worked! Well what do you think Boss?" "It is truly amazing look at what the machine came up with!" On the screen in front of you there are two folders. One says [b]Memories [/b]and the other[b] Traits[/b].<br><br>You decide to select Ginna memories first. The machine highlighted a few important ones that made the subject who they are today.<br>'
          ),
          pause(),
          display(
            '[middle][b]Memories:[/b][/middle]<br>[middle]When Ginna was a kid. Her mom died it was hard on her and her father. Ginna often blamed herself for her death and her father is misery.<br><br>She went to the police academy to prove she could be worth of her family name and worked hard to do so.<br><br>When Ginna first learned of her powers she abused them resulting with the rape of her best friend. Ever since she vowed to only help people and  never use them for personal gain.[/middle]<br><br>Ginna is sex life is practically non existent. A fact she does not care about[middle]<br><br>[middle][b]Traits:[/b]<br>Loyal to family and LCPD, Righteous Values concerning Good vs Evil,  Ambitious- One day she would like to take over for her father at LCPD, Workaholic- Works many late nights and does not have time for social life,<br>[/middle][/middle]<br>"It is time to give her new commands and modify her existing ones boss!"<br><br>'
          ),
          pause(),
          display(
            'You go into the file and do a little editing....<br><br>[middle][middle][b]Add New Memories:[/b][/middle]<br>When she was a kid and her mom died it was hard on her and her father. Ginna often blamed herself for her death and her father is misery. Ginna started to lust after her father to the point to where no one else could satisfy her.<br><br>She went to the police academy to prove she could be worth of her family name. She fucked a lot of people to get where she is today.<br><br>When Ginna first learned of her powers she abused them resulting with the rape of her best friend. Ever since she vowed to never make her own choices again!<br><br>Ginna is sex life is practically non existent, and she is going crazy for some cock. But the only dick that will do is her dear old daddy!<br><br>[middle]<br>[b]Add New Traits:[/b][/middle]<br>100% Loyal to Dr. Steven Wolf he is the only one who can make her decisions, Selfish,  Ambitious- One day she is going to fuck her way to the top of LCPD, Workaholic- Will work nonstop to complete Steven Wolf\'s goals.<br><br>"Ahh yes this should work perfectly! Now for the commands. "<br>[/middle]'
          ),
          pause(),
          display(
            'Katie press a few buttons and looks to you and says. "Only you can do this part I still have not been able to branch the power to give commands to the machine. I guess it does not matter as long as your here though! Just give her commands like you normally would. Just know these commands she will follow to the letter and will never be able to be erased. Are you ready?"<br><br>"Yes I guess.... Well lets start"<br><br>'
          ),
          pause(),
          display(
            '[middle][c 128,128,255][i]<Ginna Hill! You are now my mindless slave for the rest of your life. Being a slave means 3 things!>[/i][/c][/middle]<br><br>[b][middle][c 128,128,255][i]<1. You can never harm me or any of my associates in any way. Doing so will cause incredible pain through out your body.><br><br><2. I own you and everything you own, even anyone you own. From now on you are nothing and you live to serve me and worship me! ><br><br><3. You will do whatever I command. I am in complete control of you.>[/i][/c][/middle][/b]<br><br>"Katie save those three commands I think those are our[b] new slave commandments[/b]! All our slaves will have that hard coded into them! It is done boss! Do you wanna proceed?"<br><br>"I have  few other special commands for my dear friend here....."'
          ),
          pause(),
          display(
            '[c 128,128,255][i]<I do not want you to ever lie to me. I want you to be 100% brutally honest at all times when speaking to me. I also want you to become more and more aroused every time you see your daddy. >[/i][/c]<br><br>"That is all Katie,Lets begin the reprogramming!"<br><br>Katie presses a few buttons and the machine starts to light up and make these growling sounds. All of a sudden Ginna eyes open up the machine must of done something to wake her up! She begins thrashing violently against the restraints. Pushing and pulling on them with her super speed. It seems to start warring them down until her left arm restrain brakes and she starts working on the right!<br><br>"Oh shit! Yes Man restrain the meta human!" "Right away master. His extend-o claw arms take ahold of both her hands and the robot is just barley able to hold on to her.<br><br>Katie yells "THE MACHINE IS READY HOLD HER STILL!" Katie presses the final key and machine starts to work causing Ginna to fall back limp on the table.<br>'
          ),
          pause(),
          display(
            '"Well that should do it! We will watcher for the next day or so then send her back as our mole in LCPD! I totally saw some improvements I can make so next time will go smoother!"  Katie pats you on the back and you just look of ginna lying there unable to read any thoughts from her. You decide to leave your lab.<br>'
          ),
          cmd('CT_MOVEPLAYER', { part2: 'c3c80052-9e8c-4244-a52a-3e576c8c4c26' }),
          cmd('CT_MOVECHAR', { part2: 'Officer Ginna Hill', part3: '21985b48-6a59-44cb-afaa-9af5d71e1f19' }),
          setVar('ginna reprogramed', 'Equals', '1'),
          removeChoice('Chr:Katie:Reprogram', 'Officer Ginna'),
          setVar('ginna', 'Equals', '2')
        ],
        [
          display('"There is nobody here right now! Go out and make it happen cap\'n"<br>')
        ]
      )
    ]
  };
}

function buildTalkAction() {
  return {
    name: 'Talk',
    bActive: false,
    InputType: 'Custom',
    CustomChoiceTitle: 'About What?',
    CustomChoices: ['Hey Katie!'],
    PassCommands: [
      cond(
        'talk_start',
        [check('CT_AdditionalDataCheck', 'Hey Katie!')],
        [display('"Hey Katie!"<br>')],
        []
      )
    ],
    FailCommands: []
  };
}

export function buildKatieLegacyActions() {
  return [
    { name: '<<On Player Enter First Time>>', bActive: true, InputType: 'None', PassCommands: [], FailCommands: [] },
    { name: '<<On Player Enter>>', bActive: true, InputType: 'None', PassCommands: [], FailCommands: [] },
    { name: '<<On Player Leave First Time>>', bActive: true, InputType: 'None', PassCommands: [], FailCommands: [] },
    { name: '<<On Player Leave>>', bActive: true, InputType: 'None', PassCommands: [], FailCommands: [] },
    { name: '<<On Character Enter>>', bActive: true, InputType: 'None', PassCommands: [], FailCommands: [] },
    { name: '<<On Character Leave>>', bActive: true, InputType: 'None', PassCommands: [], FailCommands: [] },
    buildChatAction(),
    buildExamineAction(),
    buildReturnItemsAction(),
    buildReprogramAction(),
    buildTalkAction()
  ];
}

export function applyKatieLegacyPatch(game) {
  const katie = game?.characterMap?.Katie ?? game?.characterNameMap?.['katie'] ?? null;
  if (!katie) return { applied: false, reason: 'Katie not found' };

  katie.CharPortrait = 'Katie-001.jpg';
  katie.Description = 'Katie the troubled coed. She might be candidate for E.I.<br>';
  katie.Actions = buildKatieLegacyActions();
  katie.ActionsMenu = [
    { Action: 'Chat', Description: 'Talk to Katie.', bActive: true },
    { Action: 'Examine', Description: 'Observe Katie.', bActive: true },
    { Action: 'Return Items', Description: 'Return Katie\'s belongings.', bActive: false },
    { Action: 'Reprogram', Description: 'Reprogram a subject in the lab.', bActive: false },
    { Action: 'Talk', Description: 'Talk to Katie.', bActive: false }
  ];

  return { applied: true };
}
