import React, {useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Easing, Img, interpolate, spring, staticFile, delayRender, continueRender} from 'remotion';

export const C = {ink: '#151619', muted: '#777c84', line: '#e5e7e9', pale: '#f5f6f7', mint: '#dbf7e9', green: '#137551'};
export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export const out = Easing.bezier(.16, 1, .3, 1);
export const inOut = Easing.bezier(.76, 0, .24, 1);
export const p = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], clamp);
export const tween = (f: number, a: number, b: number, from: number, to: number) => interpolate(f, [a, b], [from, to], {...clamp, easing: out});
export const pop = (f: number, delay = 0) => spring({frame: f - delay, fps: 30, config: {damping: 17, stiffness: 230, mass: .7}});

export const Icon: React.FC<{name: 'globe'|'clip'|'arrow'|'chevron'|'check'|'spark'|'search'|'pin'|'code'; size?: number}> = ({name, size = 32}) => {
  const paths = {
    globe: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/></>,
    clip: <path d="m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9a6 6 0 0 1 9 9l-8 8"/>,
    arrow: <path d="M12 20V4m-7 7 7-7 7 7"/>,
    chevron: <path d="m6 9 6 6 6-6"/>,
    check: <path d="m5 12 4 4 10-10"/>,
    spark: <path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8Z"/>,
    search: <><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
    pin: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    code: <path d="m7 6-6 6 6 6m10-12 6 6-6 6m-7 2 4-16"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
};
export const Logo: React.FC<{size?: number}> = ({size = 62}) => <Img src={staticFile('khasigptlogo.png')} style={{width: size, height: size, objectFit: 'contain'}}/>;
export const Brand: React.FC<{size?: number; version?: boolean}> = ({size = 42, version = false}) => <div style={{display: 'flex', alignItems: 'center', gap: size * .2}}><Logo size={size * 1.18}/><span style={{fontSize: size, letterSpacing: -size * .055, fontWeight: 800}}>KhasiGPT</span>{version && <span style={{marginLeft: 8, padding: '6px 13px', border: `1px solid ${C.line}`, fontSize: size * .3, borderRadius: 30, fontWeight: 600}}>1.0</span>}</div>;
export const Cursor: React.FC<{x: number; y: number; click?: number; size?: number}> = ({x, y, click = 0, size = 60}) => <div style={{position: 'absolute', left: x, top: y, width: size, height: size * 1.25, zIndex: 50, scale: 1 - click * .15}}><svg viewBox="0 0 50 62" style={{width: '100%', height: '100%', filter: 'drop-shadow(0 4px 5px #0003)'}}><path d="M4 3v45l12-12 8 19 10-5-9-18h17Z" fill={C.ink} stroke="white" strokeWidth="3" strokeLinejoin="round"/></svg>{click > 0 && <div style={{position: 'absolute', left: -size*.35, top: -size*.3, width: size*1.5, height: size*1.5, border: '3px solid #151619', borderRadius: '50%', scale: 1 + click, opacity: 1 - click}}/>}</div>;
export const Eyebrow: React.FC<{children: React.ReactNode}> = ({children}) => <div style={{fontSize: 25, fontWeight: 600, letterSpacing: 5, textTransform: 'uppercase', color: C.muted}}>{children}</div>;
export const Scene: React.FC<{children: React.ReactNode}> = ({children}) => <AbsoluteFill style={{background: '#fff', color: C.ink, fontFamily: 'Inter, Arial, sans-serif', overflow: 'hidden'}}>{children}</AbsoluteFill>;
export const Composer: React.FC<{text: string; khasi?: boolean; active?: boolean}> = ({text, khasi = true, active = false}) => <div style={{position: 'relative', height: 280, borderRadius: 30, background: '#fff', border: `2px solid ${C.line}`, boxShadow: '0 8px 18px #17202408', padding: '38px 40px', textAlign: 'left'}}><div style={{fontSize: 37, lineHeight: 1.3, color: text ? C.ink : C.muted}}>{text || (khasi ? 'Send iaka message...' : 'Send a message...')}{text && <span style={{display: 'inline-block', height: 40, borderRight: `2px solid ${C.ink}`, verticalAlign: 'middle', marginLeft: 3}}/>}</div><div style={{position: 'absolute', left: 34, bottom: 30, display: 'flex', alignItems: 'center', gap: 21, fontSize: 28}}><Icon name="clip" size={29}/><Icon name="globe" size={30}/><span>{khasi ? 'Khasi' : 'English'}</span><Icon name="chevron" size={25}/></div><div style={{position: 'absolute', right: 30, bottom: 24, height: 65, width: 65, borderRadius: '50%', background: active ? C.ink : C.pale, color: active ? '#fff' : '#b5b8bd', display: 'grid', placeItems: 'center'}}><Icon name="arrow" size={35}/></div></div>;
export const PromptBubble: React.FC<{text: string}> = ({text}) => <div style={{display: 'flex', justifyContent: 'flex-end', marginBottom: 38}}><div style={{maxWidth: 740, padding: '26px 32px', fontSize: 36, lineHeight: 1.3, borderRadius: '27px 27px 8px 27px', background: C.pale, border: `1px solid ${C.line}`}}>{text}</div></div>;
export const Thinking: React.FC<{f: number}> = ({f}) => <div style={{display: 'flex', alignItems: 'center', gap: 18, fontSize: 35, color: C.muted}}><div style={{rotate: `${f * 3}deg`}}><Logo size={44}/></div><span>Dang pyrkhat</span><div style={{display: 'flex', gap: 6}}>{[0,1,2].map(i=><span key={i} style={{height: 6, width: 6, borderRadius: '50%', background: C.muted, translate: `0 ${Math.sin(f*.6-i)*4}px`}}/>)}</div></div>;
export const Chrome: React.FC<{children: React.ReactNode; title?: string}> = ({children, title = 'KhasiGPT'}) => <div style={{height: '100%', borderRadius: 34, background: '#fff', border: `2px solid ${C.line}`, boxShadow: '0 30px 85px #17202412', overflow: 'hidden'}}><div style={{height: 85, borderBottom: `1px solid ${C.line}`, padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}><div style={{display: 'flex', alignItems: 'center', gap: 11, fontSize: 25, fontWeight: 600}}><Logo size={30}/>{title}</div><div style={{display: 'flex', gap: 7}}>{[0,1,2].map(i=><div key={i} style={{width: 8, height: 8, background: '#d8dade', borderRadius: '50%'}}/>)}</div></div><div style={{position: 'relative', height: 'calc(100% - 85px)'}}>{children}</div></div>;
export const StreamText: React.FC<{text: string; count: number}> = ({text, count}) => <>{text.slice(0, Math.max(0, count))}</>;
export const ScrollDocument: React.FC<{full: React.ReactNode; children: React.ReactNode; height: number; scroll: number; padding?: number}> = ({full, children, height, scroll, padding = 40}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(height);
  const [layoutHandle] = useState(() => delayRender('Wait for response layout and local fonts'));
  useLayoutEffect(() => {
    let active = true;
    const measure = () => {if (active && ref.current) setContentHeight(ref.current.offsetHeight);};
    const observer = new ResizeObserver(measure);
    if (ref.current) observer.observe(ref.current);
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(() => continueRender(layoutHandle));
    }));
    return () => {active = false; observer.disconnect(); continueRender(layoutHandle);};
  }, [layoutHandle]);
  const offset = Math.max(0, contentHeight - height + padding * 2 + 40) * scroll;
  return <div style={{position: 'relative', height, overflow: 'hidden'}}><div ref={ref} style={{position: 'absolute', left: padding, right: padding, top: 0, visibility: 'hidden', pointerEvents: 'none'}}>{full}</div><div style={{position: 'absolute', left: padding, right: padding, top: padding, translate: `0 -${offset}px`}}>{children}</div><div style={{position: 'absolute', bottom: 0, left: 0, right: 0, height: 42, background: 'linear-gradient(transparent, white)'}}/></div>;
};
