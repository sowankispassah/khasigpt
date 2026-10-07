/*
 * KhasiGPT native (Android) UI, recreated from native/src/screens/ChatScreen.tsx,
 * native/src/components/PageHeader.tsx and AppSidebar.tsx.
 * Sizes are in dp and multiplied by k (px per dp). Inside the phone k = DP.
 */
import React from 'react';
import {
	ArrowUp,
	BookOpen,
	BriefcaseBusiness,
	Calculator,
	ChevronDown,
	Compass,
	Copy,
	EllipsisVertical,
	Globe,
	Image as ImageIcon,
	Languages,
	Mic,
	MicVocal,
	Newspaper,
	PanelLeft,
	Paperclip,
	Plus,
	ThumbsDown,
	ThumbsUp,
} from 'lucide-react';
import {C, DP, FONT} from '../theme';
import {ui, user} from '../content';
import {Logo} from './Brand';
import {Caret} from './Fx';

export const ICONS = {Plus, Languages, MicVocal, BookOpen, BriefcaseBusiness, Newspaper, Calculator, Compass, Globe};
export type IconName = keyof typeof ICONS;

type K = {k?: number};

export const Avatar: React.FC<K & {size?: number}> = ({k = DP, size = 30}) => (
	<div style={{width: size * k, height: size * k, borderRadius: '50%', background: C.emerald, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 13 * k, fontWeight: 600}}>{user.initial}</div>
);

export const AppHeader: React.FC<K & {title?: string; top?: number}> = ({k = DP, title = 'KhasiGPT', top = 34}) => (
	<div style={{position: 'absolute', left: 0, right: 0, top: top * k, height: 50 * k, display: 'flex', alignItems: 'center', padding: `0 ${12 * k}px`, gap: 10 * k, fontFamily: FONT, background: '#fff', zIndex: 10}}>
		<div style={{width: 32 * k, height: 32 * k, border: `${k}px solid ${C.border}`, borderRadius: 6 * k, display: 'grid', placeItems: 'center', color: C.ink}}>
			<PanelLeft size={18 * k} strokeWidth={1.8} />
		</div>
		<div style={{fontSize: 16 * k, fontWeight: 500, color: C.ink}}>{title}</div>
		<div style={{flex: 1}} />
		<div style={{height: 34 * k, borderRadius: 17 * k, border: `${k}px solid ${C.border}`, background: 'rgba(244,244,245,0.4)', display: 'flex', alignItems: 'center', gap: 2 * k, padding: `0 ${2 * k}px 0 ${4 * k}px`, color: C.mutedFg}}>
			<EllipsisVertical size={18 * k} strokeWidth={2} />
			<Avatar k={k} />
		</div>
	</div>
);

export const Composer: React.FC<
	K & {
		text?: string;
		placeholder?: string;
		caretF?: number | null;
		sendActive?: boolean;
		sendPress?: number;
		imageMode?: boolean;
		imagePress?: number;
		width?: number;
		minHeight?: number;
		fontSize?: number;
		style?: React.CSSProperties;
	}
> = ({k = DP, text = '', placeholder = ui.placeholder, caretF = null, sendActive = false, sendPress = 1, imageMode = false, imagePress = 1, width = 388, minHeight = 124, fontSize = 16, style}) => (
	<div
		style={{
			position: 'relative',
			width: width * k,
			minHeight: minHeight * k,
			borderRadius: 18 * k,
			border: `${Math.max(1, k * 0.9)}px solid ${C.border}`,
			background: '#fff',
			boxShadow: `0 ${k}px ${3 * k}px rgba(0,0,0,0.06)`,
			padding: `${14 * k}px ${16 * k}px ${10 * k}px`,
			fontFamily: FONT,
			display: 'flex',
			flexDirection: 'column',
			justifyContent: 'space-between',
			...style,
		}}
	>
		<div style={{fontSize: fontSize * k, lineHeight: 1.4, color: text ? C.ink : C.mutedFg, minHeight: 44 * k, paddingBottom: 8 * k, wordBreak: 'break-word'}}>
			{text || placeholder}
			{caretF !== null && caretF !== undefined ? <Caret f={caretF} h={fontSize * k * 1.15} on={false} /> : null}
		</div>
		<div style={{display: 'flex', alignItems: 'center', gap: 10 * k, color: C.ink, whiteSpace: 'nowrap'}}>
			<Paperclip size={18 * k} strokeWidth={1.8} />
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 5 * k,
					padding: imageMode ? `${5 * k}px ${10 * k}px` : `${5 * k}px 0`,
					margin: imageMode ? `0 0 0 ${-4 * k}px` : 0,
					borderRadius: 16 * k,
					background: imageMode ? C.muted : 'transparent',
					fontSize: 14.5 * k,
					fontWeight: 500,
					transform: `scale(${imagePress})`,
				}}
			>
				<ImageIcon size={16 * k} strokeWidth={1.9} />
				<span>{ui.generateImage}</span>
			</div>
			<div style={{display: 'flex', alignItems: 'center', gap: 4 * k, fontSize: 14.5 * k, fontWeight: 500}}>
				<Globe size={17 * k} strokeWidth={1.8} />
				<span>{ui.language}</span>
				<ChevronDown size={13 * k} strokeWidth={2.2} />
			</div>
			<div style={{flex: 1}} />
			{imageMode ? null : (
				<div style={{width: 38 * k, height: 38 * k, borderRadius: '50%', background: C.muted, display: 'grid', placeItems: 'center'}}>
					<Mic size={18 * k} strokeWidth={1.9} />
				</div>
			)}
			<div
				style={{
					width: 38 * k,
					height: 38 * k,
					borderRadius: '50%',
					background: sendActive ? C.primary : C.muted,
					color: sendActive ? '#fafafa' : C.mutedFg,
					display: 'grid',
					placeItems: 'center',
					transform: `scale(${sendPress})`,
				}}
			>
				<ArrowUp size={18 * k} strokeWidth={2.2} />
			</div>
		</div>
	</div>
);

export const Disclaimer: React.FC<K> = ({k = DP}) => (
	<div style={{fontSize: 12 * k, lineHeight: 1.35, color: C.mutedFg, textAlign: 'center', padding: `${6 * k}px ${18 * k}px 0`}}>
		{ui.disclaimer} <span style={{fontWeight: 700, textDecoration: 'underline', color: C.ink}}>Pule Privacy Policy.</span>
	</div>
);

/** Bottom composer dock as laid out on the chat screen. */
export const ComposerDock: React.FC<K & React.ComponentProps<typeof Composer> & {bottom?: number; composerOpacity?: number}> = ({k = DP, bottom = 14, composerOpacity = 1, ...rest}) => (
	<div style={{position: 'absolute', left: 12 * k, right: 12 * k, bottom: bottom * k, zIndex: 12, background: '#fff'}}>
		<Composer k={k} {...rest} style={{opacity: composerOpacity}} />
		<Disclaimer k={k} />
	</div>
);

export const UserBubble: React.FC<K & {text: string; style?: React.CSSProperties}> = ({k = DP, text, style}) => (
	<div style={{display: 'flex', justifyContent: 'flex-end', ...style}}>
		<div style={{maxWidth: '78%', padding: `${8 * k}px ${12 * k}px`, borderRadius: 16 * k, background: C.muted, border: `${k * 0.8}px solid ${C.border}`, fontSize: 15 * k, lineHeight: `${20 * k}px`, color: C.ink, fontFamily: FONT}}>{text}</div>
	</div>
);

export const Thinking: React.FC<K & {f: number; text?: string}> = ({k = DP, f, text = ui.thinking}) => {
	const dots = (Math.floor(f / 25) % 3) + 1;
	return (
		<div style={{display: 'flex', alignItems: 'center', gap: 8 * k, fontSize: 15 * k, color: C.mutedFg, fontFamily: FONT, paddingLeft: 4 * k}}>
			<div style={{rotate: `${f * 5}deg`, display: 'grid'}}>
				<Logo size={18 * k} style={{opacity: 0.8}} />
			</div>
			<span>
				{text}
				<span style={{display: 'inline-block', width: 20 * k}}>{'.'.repeat(dots)}</span>
			</span>
		</div>
	);
};

export const MessageActions: React.FC<K> = ({k = DP}) => (
	<div style={{display: 'flex', gap: 14 * k, color: C.mutedFg, padding: `${8 * k}px ${4 * k}px`}}>
		<Copy size={16 * k} strokeWidth={1.8} />
		<ThumbsUp size={16 * k} strokeWidth={1.8} />
		<ThumbsDown size={16 * k} strokeWidth={1.8} />
	</div>
);

/** Markdown-ish streamed answer: intro, bullet sections with bold titles, closing. */
export const StreamedAnswer: React.FC<
	K & {
		intro: string;
		sections: readonly (readonly [string, string])[];
		closing?: string;
		count: number;
		fontSize?: number;
	}
> = ({k = DP, intro, sections, closing = '', count, fontSize = 17}) => {
	let left = count;
	const take = (s: string) => {
		const out = s.slice(0, Math.max(0, Math.min(s.length, left)));
		left -= s.length;
		return out;
	};
	const introTxt = take(intro);
	const rows = sections.map(([a, b]) => [take(a), take(b)] as const);
	const closeTxt = take(closing);
	return (
		<div style={{fontFamily: FONT, fontSize: fontSize * k, lineHeight: `${25 * (fontSize / 17) * k}px`, color: C.ink, padding: `0 ${4 * k}px`, maxWidth: '96%'}}>
			{introTxt ? <p style={{margin: `0 0 ${10 * k}px`}}>{introTxt}</p> : null}
			{rows.some(([a]) => a) ? (
				<ul style={{margin: 0, paddingLeft: 20 * k}}>
					{rows.map(([a, b], i) =>
						a ? (
							<li key={i} style={{marginBottom: 8 * k}}>
								<strong style={{fontWeight: 600}}>{a}</strong> {b}
							</li>
						) : null,
					)}
				</ul>
			) : null}
			{closeTxt ? <p style={{margin: `${10 * k}px 0 0`}}>{closeTxt}</p> : null}
		</div>
	);
};

export const answerLength = (intro: string, sections: readonly (readonly [string, string])[], closing = '') =>
	intro.length + sections.reduce((n, [a, b]) => n + a.length + b.length, 0) + closing.length;

export const Greeting: React.FC<K & {top?: number; opacity?: number}> = ({k = DP, top = 300, opacity = 1}) => (
	<div style={{position: 'absolute', left: 24 * k, right: 24 * k, top: top * k, textAlign: 'center', fontFamily: FONT, opacity}}>
		<div style={{fontSize: 23 * k, fontWeight: 700, color: C.ink, lineHeight: `${32 * k}px`}}>{ui.greeting}</div>
		<div style={{fontSize: 23 * k, color: C.mutedFg, lineHeight: `${32 * k}px`}}>{ui.greetingSub}</div>
	</div>
);

export const Drawer: React.FC<K & {items: readonly {label: string; icon: string}[]; history: string[]; highlight?: number}> = ({k = DP, items, history, highlight = -1}) => (
	<div style={{position: 'absolute', left: 0, top: 0, bottom: 0, width: 288 * k, background: '#fff', boxShadow: `${8 * k}px 0 ${30 * k}px rgba(0,0,0,0.12)`, fontFamily: FONT, padding: `${54 * k}px ${20 * k}px`, zIndex: 25}}>
		<div style={{display: 'flex', alignItems: 'center', gap: 10 * k, marginBottom: 28 * k}}>
			<Logo size={23 * k} />
			<span style={{fontSize: 21 * k, fontWeight: 700, color: C.ink}}>KhasiGPT</span>
		</div>
		{items.map((it, i) => {
			const Icon = ICONS[it.icon as IconName] ?? Plus;
			return (
				<div key={it.label} style={{display: 'flex', alignItems: 'center', gap: 12 * k, fontSize: 17 * k, fontWeight: 500, color: i === highlight ? C.ink : C.mutedFg, height: 44 * k, padding: `0 ${8 * k}px`, borderRadius: 8 * k, background: i === highlight ? C.muted : 'transparent'}}>
					<Icon size={18 * k} strokeWidth={1.9} />
					{it.label}
				</div>
			);
		})}
		<div style={{height: k, background: C.border, margin: `${14 * k}px 0`}} />
		<div style={{fontSize: 14 * k, color: C.history, marginBottom: 8 * k, fontWeight: 500}}>Chat History</div>
		{history.map((h) => (
			<div key={h} style={{fontSize: 15 * k, color: C.sidebarFg, height: 36 * k, display: 'flex', alignItems: 'center', padding: `0 ${8 * k}px`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
				{h}
			</div>
		))}
	</div>
);
