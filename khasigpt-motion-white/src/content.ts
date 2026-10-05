export const helpQuestion = 'kaei phi lah ban iarap ianga?';
export const helpIntro = 'Nga lah ban iarap ia phi ha kiba bun ki bynta, kum:';
export const helpSections = [
  ['Ka ktien bad jingpynkylla ktien:', 'Pynkylla ktien hapdeng ka Khasi bad ka Phrangsngi, pynbeit ia ki jingthoh, bad pynshai ia ki kyntien bad ka gramor.'],
  ['Ka Riti Dustur bad Jingtip shaphang ka Ri Khasi:', 'Jubab ia ki jingkylli halor ka kolshor, ka histori, bad ki jingtip shaphang ka thain jong ngi.'],
  ['Ka jingthoh:', 'Thoh shithi, jingbatai (essay), poitri, jingrwai, ne pynbiang ia kiwei de ki jait jingthoh.'],
  ['Ka jingpule bad jingtip kyllum:', 'Iarap ha ki jingpule kot, ki sobjek bapher bapher kum ka sain (science), ka jingkhein (maths), bad kiwei pat.'],
  ['Ka coding bad kompiwter:', 'Iarap thoh bad pynbeit (debug) ia ki program kompiwter.'],
  ['Ka jingpynmih dur:', 'Thaw dur katkum kaba phi batai ne kwah.'],
  ['Ki jingkylli man ka sngi:', 'Ai jingmut bad jubab ia kano kano ka jingkylli kaba phi sngewtynnad ban tip.'],
] as const;
export const helpClosing = 'Kaei kaba phi kwah ba ngan iarap ia phi mynta?';

export const shopQuestion = 'pynwad Tshirt ba hapoh 500 tyngka';
export const shopIntro = 'Kine ki long katto-katne ki jait T-shirt ba bha ba hapoh ₹500 ba phi lah ban jied:';
export const shopSuggestions = [
  ['Max Men Lounge T-Shirt', 'Kumba ₹198 (na Amazon)'],
  ['The Roadster Lifestyle Co. Cotton T-shirt', 'Kumba ₹258 (na Myntra)'],
  ['Decathlon Sportee Men Cotton Top 100', 'Kumba ₹299 (na Decathlon)'],
  ['Max Men Solid Polo T-Shirt', 'Kumba ₹329 (na Amazon) lane ₹349 (na Max Fashion)'],
  ['Maroon Melange Casual Solid T-Shirt', 'Kumba ₹499 (na Crocodile Showroom)'],
] as const;
export const shopNote = 'Ki dor bad ka jingdon jong kine ki mar ki lah ban kylla katkam ka por ha ki dukan online.';
export const products = [
  {name: "Max Men's Polycotton Half Sleeves Regular Fit Solid Polo T-Shirt", store: 'Amazon.in', price: '₹329', x: 656, y: 428},
  {name: 'max Men Solid Polo T-Shirt', store: 'maxfashion.in', price: '₹349', x: 948, y: 428},
  {name: 'The Roadster Lifestyle Co. Cotton T-shirt (S) by Myntra', store: 'Myntra', price: '₹258', x: 1240, y: 428},
  {name: 'max Solid Men Lounge T-Shirt At NykaaMan', store: 'Amazon.in', price: '₹198', x: 656, y: 947},
  {name: 'Decathlon Sportee Men Cotton Top 100', store: 'Decathlon Sports India', price: '₹299', x: 948, y: 947},
  {name: 'Maroon Melange Casual Solid T-Shirt', store: 'Crocodile Showroom', price: '₹499', x: 1240, y: 947},
];

export const newsQuestion = 'Jia aiu mynta ka Sngi ha Shillong?';
export const newsIntro = 'Kine ki long ki khubor ba dang shna ha Shillong bad Meghalaya na ki lad khubor ba dang pynmih kham shen:';
export const newsArticles = [
  {
    title: 'Ka jingpluh ding ha surok GS Road, Shillong',
    body: 'Kawei ka jingpluh ding kaba jur ka la jia ha kawei ka ïing Assam-type kaba don ha GS Road ha nongbah Shillong ha ka sngi U Blei. Kane ka jingpluh ka la pynmih ïa ka tdem kaba rben bad ka jingïakhun ban pynlip ïa ka ding ka la pynlong ïa ki paidbah ban thut ha katei ka bynta jong ka surok bah.',
    date: '28 September 2026', source: 'The Shillong Times',
    url: 'https://theshillongtimes.com/2026/09/28/a-thick-blanket-of-smoke-engulfs-the-area-following-a-blaze-in-an-assam-type-structure-on-gs-road-in-the-city-on-sunday-ub/',
  },
  {
    title: 'Ka saiñ pyrthei bad ka jingmaham u nongïalam Congress',
    body: 'U nongïalam ka Congress u la pynpaw ka jingmaham ba ka BJP kan pyndonkam da ki tnat tohkit kum ka Enforcement Directorate (ED) bad Central Bureau of Investigation (CBI) pyrshah wat ïa ki paralok ba ïatreilang bad ka ha ka kynhun sorkar. Une u nongïalam u la pynpaw ruh ba ka jingkhih jingïakynad hapoh ka UDP ka la plie lad ïa ka Congress ban kham pynkhlaiñ ïa lade ha ka jylla, hadien ba phra ngut ki MLA ka UDP ki la pynïasoh sha ka BJP.',
    date: '28 September 2026', source: 'The Shillong Times',
    url: 'https://theshillongtimes.com/2026/09/28/bjp-will-use-ed-cbi-against-its-own-allies-cong-chief-cautions/',
  },
  {
    title: 'Ka jingïalang jong ka MCTA ha Synod College, Shillong',
    body: 'Ha ka 36th Biennial General Conference jong ka Meghalaya College Teachers’ Association (MCTA) kaba la long ha Synod College, u Myntri Sorkar Sanbor Shullai u la kyntu ïa ki nonghikai ba kin ïatreilang bad ka sorkar ban pynbeit ïa ki jingeh jong ka pule puthi. Hynrei u MLA ka VPP na Mawlai, u Brightstarwell Marbaniang, u la kyntu pynban ïa ki nonghikai ba kim dei ban shu sngap jar bad u la buh jingkylli halor ka rukom thungkam bad ki kyndon rta kiba pynduh lad ïa kiba stad ban ïoh kam hikai.',
    date: '27 September 2026', source: 'The Shillong Times',
    url: 'https://theshillongtimes.com/2026/09/27/meghalaya-nuggets-681/',
  },
  {
    title: 'Ka jingpynkup burom ïa ka nongthoh kot Khasi ha Shillong',
    body: 'Ha kawei ka prokram kaba ïadei bad ka thoh ka tar kaba la pynlong ha nongbah Shillong, la pynkup burom kyrpang ïa ka nongthoh kot Khasi kaba pawnam, ka Kong Streamlet Dkhar. Kane ka prokram ka dei ban kynmaw bad burom ïa ka jingnoh synñiang kaba khraw jong ka ha ka thoh ka tar bad ka jingpynneh pynsah ïa ka ktien Khasi.',
    date: '27 September 2026', source: 'The Shillong Times',
    url: 'https://theshillongtimes.com/2026/09/27/shillong-literary-event-honours-khasi-author-streamlet-dkhar/',
  },
];

export const plans = [
  {name: 'Free', price: 'Free', benefit: 'Free 3 KhasiGPT replies per day', button: 'Free Plan'},
  {name: 'Starter', price: '₹499', credits: '2,500 credits', validity: 'Validity: 90 sngi', button: 'Recharge da ka Starter'},
  {name: 'Pro', price: '₹699', credits: '3,500 credits', validity: 'Validity: 90 sngi', button: 'Recharge da ka Pro', recommended: true},
  {name: 'Ultimate', price: '₹999', credits: '5,000 credits', validity: 'Validity: 90 sngi', button: 'Recharge da ka Ultimate'},
];
