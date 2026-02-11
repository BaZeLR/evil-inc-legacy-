import React, { useEffect, useMemo, useRef, useState } from 'react';

const PLACEHOLDER_MEDIA = '/Assets/images/characters/placeholder.png';

const SCREENS = {
  ageGate: {
    title: 'Disclaimer',
    media: PLACEHOLDER_MEDIA,
    text: `This game contains the depictions and descriptions of sexual acts between adult persons. If this offends you, is against the law in your community or if you are under the legal age to view such material, please quit now.
This is a pure fictional story. All characters and locations depicted herein are truly fictional and any resemblance to any person, living or dead, is not intended and purely coincidental. All characters depicted herein are considered to be above the age of 18.
I do not support in any way the acts described in this game. Always use your powers responsibly.`
  },
  toPlayers: {
    title: 'To Players',
    media: PLACEHOLDER_MEDIA,
    text: `Disregard the spelling and grammar. This is still a story in progress.
Every so often I'll go through to tweak the story or add additional details. For the most part the events shouldn't change.
Please feel free to leave any comments on the forum.

This is a legacy game that I decided to revive, inspired by the original one that was created and abandoned by rrod424 and many others, written on RAGS (RIP).
Built with AI help. Expect the continuation, weirdness, and a lot of AI pictures.

PS: If you're interested in development, welcome to DM. Let's team up.
Enjoy!`
  },
  splash: {
    title: 'Evil Incorporated',
    media: PLACEHOLDER_MEDIA,
    text: 'Animation placeholder: Evil Incorporated logo sequence.'
  },
  choice: {
    title: 'Start',
    media: PLACEHOLDER_MEDIA,
    text: `Would you like to play the full intro before the prologue, or skip straight to East Side?
If you skip, you still need to visit Evil Inc to read Dr. Evil's mail and obtain the E.I. security badge.`
  }
};

const STEP_ORDER = ['ageGate', 'toPlayers', 'splash', 'choice'];

export function StartScreen({ onPlayIntro, onSkipIntro, onContinue }) {
  const [step, setStep] = useState('ageGate');
  const [blocked, setBlocked] = useState(false);
  const [fxEnabled, setFxEnabled] = useState(true);
  const fxRef = useRef(null);
  const fxAppRef = useRef(null);
  const fxBorderRef = useRef(null);

  useEffect(() => {
    if (step !== 'splash') return;
    const timer = setTimeout(() => setStep('choice'), 2000);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (!fxEnabled) return;
    if (!fxRef.current || fxAppRef.current) return;
    let cancelled = false;
    let app = null;

    const initFx = async () => {
      try {
        const PIXI = await import('pixi.js');
        if (cancelled || !fxRef.current) return;

        app = new PIXI.Application({
          resizeTo: fxRef.current,
          backgroundAlpha: 0,
          antialias: true,
          powerPreference: 'high-performance'
        });
        fxRef.current.appendChild(app.view);
        fxAppRef.current = app;

        const particleContainer = new PIXI.Container();
        particleContainer.alpha = 0.85;
        app.stage.addChild(particleContainer);

        const sparkGfx = new PIXI.Graphics();
        sparkGfx.beginFill(0xd4af37, 1);
        sparkGfx.drawCircle(0, 0, 2);
        sparkGfx.endFill();
        const sparkTexture = app.renderer.generateTexture(sparkGfx);

        const particles = [];
        const createParticle = () => {
          const sprite = new PIXI.Sprite(sparkTexture);
          sprite.anchor.set(0.5);
          sprite.scale.set(0.35 + Math.random() * 1.2);
          sprite.alpha = 0.15 + Math.random() * 0.55;
          sprite.x = Math.random() * app.renderer.width;
          sprite.y = Math.random() * app.renderer.height;
          sprite.vx = -0.12 + Math.random() * 0.24;
          sprite.vy = -0.08 + Math.random() * 0.2;
          sprite.twinkle = 0.008 + Math.random() * 0.015;
          particleContainer.addChild(sprite);
          particles.push(sprite);
        };

        for (let i = 0; i < 120; i += 1) createParticle();

        const border = new PIXI.Graphics();
        fxBorderRef.current = border;
        app.stage.addChild(border);

        app.ticker.add(() => {
          const w = app.renderer.width;
          const h = app.renderer.height;
          particles.forEach(sprite => {
            sprite.x += sprite.vx;
            sprite.y += sprite.vy;
            if (sprite.x < -10) sprite.x = w + 10;
            if (sprite.x > w + 10) sprite.x = -10;
            if (sprite.y < -10) sprite.y = h + 10;
            if (sprite.y > h + 10) sprite.y = -10;
            sprite.alpha += Math.sin(app.ticker.lastTime * sprite.twinkle) * 0.001;
          });
          border.clear();
          border.lineStyle(2, 0xd4af37, 0.35);
          border.drawRoundedRect(36, 36, w - 72, h - 72, 22);
          border.lineStyle(1, 0xffcc66, 0.2);
          border.drawRoundedRect(52, 52, w - 104, h - 104, 18);
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('StartScreen FX disabled:', error?.message || String(error));
        setFxEnabled(false);
      }
    };

    void initFx();
    return () => {
      cancelled = true;
      if (app) {
        app.destroy(true, { children: true, texture: true, baseTexture: true });
      }
      fxAppRef.current = null;
    };
  }, [fxEnabled]);

  const screen = useMemo(() => SCREENS[step] || SCREENS.ageGate, [step]);
  const isPlain = step === 'ageGate' || step === 'toPlayers';

  useEffect(() => {
    if (!fxBorderRef.current) return;
    fxBorderRef.current.alpha = isPlain ? 0 : 1;
  }, [isPlain]);

  if (blocked) {
    return (
      <section className="start-screen" role="dialog" aria-label="Age gate">
        <div className="start-screen__panel">
          <div className="start-screen__title">Access Restricted</div>
          <div className="start-screen__copy">
            You must be 18+ to play. Please close this tab or return when you are of legal age.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="start-screen" role="dialog" aria-label="Game start">
      {fxEnabled ? <div className="start-screen__fx" ref={fxRef} aria-hidden="true" /> : null}
      <div className={`start-screen__panel${isPlain ? ' start-screen__panel--plain' : ''}`}>
        <div className="start-screen__eyebrow">EVIL Incorporated</div>
        <div className="start-screen__title">{screen.title}</div>
        {!isPlain ? (
          <div className="start-screen__media" aria-hidden="true">
            <img src={screen.media} alt="" />
          </div>
        ) : null}
        <div className="start-screen__copy">{screen.text}</div>

        {step === 'ageGate' ? (
          <div className="start-screen__actions">
            <button type="button" className="start-screen__btn start-screen__btn--accept" onClick={() => setStep('choice')}>
              I'm 18 and play
            </button>
            <button type="button" className="start-screen__btn start-screen__btn--deny" onClick={() => setBlocked(true)}>
              I am not 18 and leave
            </button>
          </div>
        ) : null}

        {step === 'toPlayers' ? (
          <div className="start-screen__actions">
            <button type="button" className="start-screen__btn" onClick={() => setStep('splash')}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 'splash' ? (
          <div className="start-screen__actions">
            <button type="button" className="start-screen__btn" onClick={() => setStep('choice')}>
              Continue
            </button>
          </div>
        ) : null}

        {step === 'choice' ? (
          <div className="start-screen__actions">
            <button type="button" className="start-screen__btn" onClick={() => onPlayIntro?.()}>
              Play Intro (then Prologue)
            </button>
            <button type="button" className="start-screen__btn start-screen__btn--ghost" onClick={() => onSkipIntro?.()}>
              Skip Intro (Start at East Side)
            </button>
            {onContinue ? (
              <button type="button" className="start-screen__btn start-screen__btn--ghost" onClick={() => onContinue?.()}>
                Continue Last Save
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
