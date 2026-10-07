/*
 * All on-screen copy lives here.
 * Khasi strings are reused from the app's own fallbacks (lib/i18n/dictionary.ts)
 * and from the chat transcripts the user supplied for the earlier promos.
 */

export const user = {name: 'Khraw', initial: 'K'};

export const ui = {
	greeting: `Hi, ${user.name}!`,
	greetingSub: 'Kaei nga lah ban iarap ia phi mynta?',
	placeholder: 'Send iaka message...',
	imagePlaceholder: 'Enter image prompt here...',
	language: 'Khasi',
	generateImage: 'Generate image',
	disclaimer: 'Ka KhasiGPT ne kiwei pat ki AI models ki lah ban bakla.',
	thinking: 'Dang pyrkhat',
	time: '10:20',
};

/* ---------------------------------------------------------------- chat */
export const chat = {
	question: 'kaei phi lah ban iarap ianga?',
	intro: 'Nga lah ban iarap ia phi ha kiba bun ki bynta, kum:',
	sections: [
		['Ka ktien bad jingpynkylla ktien:', 'Pynkylla ktien hapdeng ka Khasi bad ka Phrangsngi, pynbeit ia ki jingthoh, bad pynshai ia ki kyntien bad ka gramor.'],
		['Ka Riti Dustur bad Jingtip shaphang ka Ri Khasi:', 'Jubab ia ki jingkylli halor ka kolshor, ka histori, bad ki jingtip shaphang ka thain jong ngi.'],
		['Ka jingthoh:', 'Thoh shithi, jingbatai (essay), poitri, jingrwai, ne pynbiang ia kiwei de ki jait jingthoh.'],
		['Ka jingpule bad jingtip kyllum:', 'Iarap ha ki jingpule kot, ki sobjek bapher bapher kum ka sain (science), ka jingkhein (maths), bad kiwei pat.'],
		['Ka coding bad kompiwter:', 'Iarap thoh bad pynbeit (debug) ia ki program kompiwter.'],
		['Ka jingpynmih dur:', 'Thaw dur katkum kaba phi batai ne kwah.'],
		['Ki jingkylli man ka sngi:', 'Ai jingmut bad jubab ia kano kano ka jingkylli kaba phi sngewtynnad ban tip.'],
	] as const,
	closing: 'Kaei kaba phi kwah ba ngan iarap ia phi mynta?',
};

/* ---------------------------------------------------------------- voice */
export const voice = {
	title: 'Voice chat',
	userSays: 'Jia aiu mynta ka Sngi ha Shillong?',
	reply: 'Kine ki long ki khubor ba dang shna ha Shillong bad Meghalaya…',
	end: 'End voice chat',
	cancel: 'Cancel',
};

/* ---------------------------------------------------------------- image */
export const image = {
	prompt: 'Sunset over Umiam Lake, pine hills, dreamy digital art',
	generating: 'Generating...',
	download: 'Download',
};

/* ---------------------------------------------------------------- explore */
export const explore = {
	title: 'Nearby',
	subtitle: 'Discover places, businesses, food, events and experiences around your selected location.',
	location: 'Shillong, Meghalaya',
	radius: 50,
	search: 'Search restaurants, shops, businesses, events, places...',
	heading: 'Explore Around You',
	categories: ['Places to visit', 'Waterfalls', 'Food', 'Cafés', 'Shopping', 'Events'],
	places: [
		{name: 'Nohkalikai Falls', area: 'Sohra, East Khasi Hills', km: 42, img: 'places/nohkalikai.jpg', kind: 'Waterfall'},
		{name: 'Double Decker Living Root Bridge', area: 'Nongriat, East Khasi Hills', km: 46, img: 'places/root-bridge.jpg', kind: 'Heritage'},
		{name: 'Umngot River', area: 'Dawki, West Jaintia Hills', km: 48, img: 'places/dawki.jpg', kind: 'River'},
		{name: "Ward's Lake", area: 'Police Bazar, Shillong', km: 0.9, img: 'places/wards-lake.jpg', kind: 'Lake & park'},
		{name: 'Laitlum Canyons', area: 'Smit, East Khasi Hills', km: 18, img: 'places/laitlum.jpg', kind: 'Viewpoint'},
		{name: 'Shillong Peak', area: 'Upper Shillong', km: 6, img: 'places/shillong-peak.jpg', kind: 'Viewpoint'},
	],
};

export const features = [
	{label: 'Live Translation', icon: 'MicVocal'},
	{label: 'Translate', icon: 'Languages'},
	{label: 'Study Mode', icon: 'BookOpen'},
	{label: 'Jobs', icon: 'BriefcaseBusiness'},
	{label: 'Calculator', icon: 'Calculator'},
	{label: 'News', icon: 'Newspaper'},
	{label: 'Web search', icon: 'Globe'},
	{label: 'Nearby', icon: 'Compass'},
] as const;

export const drawer = {
	items: [
		{label: 'New chat', icon: 'Plus'},
		{label: 'Live Translation', icon: 'Languages'},
		{label: 'Study Mode', icon: 'BookOpen'},
		{label: 'Jobs', icon: 'BriefcaseBusiness'},
		{label: 'News', icon: 'Newspaper'},
		{label: 'Calculator', icon: 'Calculator'},
		{label: 'Nearby', icon: 'Compass'},
	] as const,
	history: ['Jia aiu mynta ka Sngi ha Shillong?', 'Sunset over Umiam Lake', 'kaei phi lah ban iarap ianga?', 'pynwad Tshirt ba hapoh 500 tyngka'],
};

/* ---------------------------------------------------------------- headlines (English marketing copy) */
export const copy = {
	hook: ['The AI that', 'speaks', 'Khasi.'],
	hookSub: 'Kylli da ka ktien Khasi.',
	chat: ['Ask anything.', 'In Khasi.'],
	voice: ['Just talk.'],
	voiceSub: 'Voice conversations in Khasi',
	image: ['Imagine it.', 'See it.'],
	explore: ['Explore', 'Meghalaya.'],
	exploreSub: 'Places, food and experiences near you',
	more: ['All in one app.'],
	tagline: 'Your language. Your AI.',
	endTagline: 'The AI that speaks Khasi.',
	cta: 'Try it free',
	url: 'khasigpt.com',
	play: 'Download ïa ka app na',
};
