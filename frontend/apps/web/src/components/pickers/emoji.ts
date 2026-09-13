// Compact built-in emoji set for the icon picker (no runtime dependency). Each entry is
// `[glyph, keywords]`; keywords drive the search box. Grouped in Notion's category order.
export interface EmojiGroup {
  name: string;
  emoji: readonly (readonly [string, string])[];
}

export const EMOJI_GROUPS: readonly EmojiGroup[] = [
  {
    name: 'Smileys & people',
    emoji: [
      ['😀', 'grin smile happy'], ['😃', 'smiley happy'], ['😄', 'laugh happy'], ['😁', 'beam grin'],
      ['😆', 'laughing lol'], ['😅', 'sweat laugh'], ['🤣', 'rofl laugh'], ['😂', 'joy tears laugh'],
      ['🙂', 'slight smile'], ['😉', 'wink'], ['😊', 'blush smile'], ['😇', 'innocent halo angel'],
      ['🥰', 'love hearts'], ['😍', 'heart eyes love'], ['😘', 'kiss'], ['😗', 'kissing'],
      ['🤪', 'zany crazy'], ['😜', 'tongue wink'], ['🤨', 'eyebrow suspicious'], ['🧐', 'monocle inspect'],
      ['🤓', 'nerd glasses'], ['😎', 'cool sunglasses'], ['🤩', 'star struck'], ['🥳', 'party celebrate'],
      ['😏', 'smirk'], ['😒', 'unamused'], ['😞', 'disappointed sad'], ['😔', 'pensive sad'],
      ['😢', 'cry sad tear'], ['😭', 'sob cry'], ['😤', 'triumph steam'], ['😡', 'angry rage'],
      ['🤯', 'mind blown explode'], ['😳', 'flushed surprised'], ['🥵', 'hot heat'], ['🥶', 'cold freeze'],
      ['😱', 'scream fear'], ['😨', 'fearful'], ['🤗', 'hug'], ['🤔', 'thinking hmm'],
      ['🤫', 'shush quiet'], ['🤐', 'zipper silence'], ['😴', 'sleep zzz'], ['🤒', 'sick ill'],
      ['🤠', 'cowboy'], ['👻', 'ghost halloween'], ['💀', 'skull dead'], ['👽', 'alien ufo'],
      ['🤖', 'robot bot ai'], ['🎃', 'pumpkin halloween'], ['😺', 'cat happy'], ['🙈', 'monkey see'],
      ['👋', 'wave hello hi'], ['🤚', 'hand raised'], ['✋', 'hand stop'], ['👌', 'ok perfect'],
      ['✌️', 'victory peace'], ['🤞', 'crossed fingers luck'], ['🤟', 'love you'], ['👍', 'thumbs up like'],
      ['👎', 'thumbs down dislike'], ['👊', 'fist bump'], ['👏', 'clap applause'], ['🙌', 'raised hands hooray'],
      ['🙏', 'pray thanks please'], ['💪', 'muscle strong'], ['🧠', 'brain mind think'], ['👀', 'eyes look'],
      ['👶', 'baby'], ['🧑', 'person'], ['👩', 'woman'], ['👨', 'man'],
      ['🧑‍💻', 'developer coder programmer'], ['🕵️', 'detective spy search'], ['🦸', 'hero superhero'], ['🧙', 'wizard mage'],
    ],
  },
  {
    name: 'Animals & nature',
    emoji: [
      ['🐶', 'dog puppy'], ['🐱', 'cat kitten'], ['🐭', 'mouse'], ['🐹', 'hamster'],
      ['🐰', 'rabbit bunny'], ['🦊', 'fox'], ['🐻', 'bear'], ['🐼', 'panda'],
      ['🐨', 'koala'], ['🐯', 'tiger'], ['🦁', 'lion'], ['🐮', 'cow'],
      ['🐷', 'pig'], ['🐸', 'frog'], ['🐵', 'monkey'], ['🐔', 'chicken'],
      ['🐧', 'penguin'], ['🐦', 'bird'], ['🦆', 'duck'], ['🦉', 'owl wise'],
      ['🦅', 'eagle'], ['🐺', 'wolf'], ['🐗', 'boar'], ['🐴', 'horse'],
      ['🦄', 'unicorn magic'], ['🐝', 'bee honey'], ['🐛', 'bug caterpillar'], ['🦋', 'butterfly'],
      ['🐌', 'snail slow'], ['🐞', 'ladybug'], ['🐢', 'turtle'], ['🐍', 'snake'],
      ['🐙', 'octopus'], ['🦑', 'squid'], ['🦀', 'crab'], ['🐳', 'whale'],
      ['🐬', 'dolphin'], ['🐟', 'fish'], ['🌵', 'cactus plant'], ['🌲', 'tree evergreen'],
      ['🌳', 'tree'], ['🌴', 'palm tree'], ['🌱', 'seedling grow'], ['🌿', 'herb leaf'],
      ['☘️', 'clover luck'], ['🍀', 'four leaf clover luck'], ['🍁', 'maple leaf autumn'], ['🍄', 'mushroom'],
      ['🌷', 'tulip flower'], ['🌹', 'rose flower'], ['🌻', 'sunflower'], ['🌼', 'blossom flower'],
      ['🌸', 'cherry blossom sakura'], ['🌈', 'rainbow'], ['⭐', 'star'], ['🌟', 'glowing star sparkle'],
      ['✨', 'sparkles magic new'], ['⚡', 'lightning bolt fast energy'], ['🔥', 'fire hot flame'], ['💧', 'droplet water'],
      ['🌊', 'wave ocean water'], ['❄️', 'snowflake cold winter'], ['☀️', 'sun sunny'], ['🌙', 'moon night'],
      ['☁️', 'cloud'], ['🌍', 'earth globe world'], ['🌋', 'volcano'], ['🏔️', 'mountain snow'],
    ],
  },
  {
    name: 'Food & drink',
    emoji: [
      ['🍎', 'apple fruit'], ['🍊', 'orange tangerine fruit'], ['🍋', 'lemon'], ['🍌', 'banana'],
      ['🍉', 'watermelon'], ['🍇', 'grapes'], ['🍓', 'strawberry'], ['🫐', 'blueberries'],
      ['🍒', 'cherries'], ['🍑', 'peach'], ['🥭', 'mango'], ['🍍', 'pineapple'],
      ['🥥', 'coconut'], ['🥑', 'avocado'], ['🍅', 'tomato'], ['🥕', 'carrot'],
      ['🌽', 'corn'], ['🌶️', 'chili pepper spicy'], ['🥦', 'broccoli'], ['🧄', 'garlic'],
      ['🍞', 'bread'], ['🥐', 'croissant'], ['🥨', 'pretzel'], ['🧀', 'cheese'],
      ['🍳', 'egg cooking breakfast'], ['🥞', 'pancakes'], ['🍔', 'burger'], ['🍟', 'fries'],
      ['🍕', 'pizza'], ['🌮', 'taco'], ['🌯', 'burrito'], ['🍜', 'ramen noodles'],
      ['🍣', 'sushi'], ['🍱', 'bento'], ['🍚', 'rice'], ['🥗', 'salad healthy'],
      ['🍿', 'popcorn movie'], ['🍩', 'donut'], ['🍪', 'cookie'], ['🎂', 'birthday cake'],
      ['🍰', 'cake slice'], ['🍫', 'chocolate'], ['🍬', 'candy'], ['🍦', 'ice cream'],
      ['☕', 'coffee tea hot'], ['🫖', 'teapot tea'], ['🍵', 'green tea matcha'], ['🧃', 'juice box'],
      ['🥤', 'soda cup drink'], ['🍺', 'beer'], ['🍷', 'wine'], ['🥂', 'cheers celebrate'],
      ['🍾', 'champagne celebrate'], ['🥛', 'milk'], ['🧊', 'ice cube'], ['🍽️', 'plate dinner'],
    ],
  },
  {
    name: 'Travel & places',
    emoji: [
      ['🏠', 'house home'], ['🏡', 'home garden'], ['🏢', 'office building work'], ['🏫', 'school'],
      ['🏥', 'hospital'], ['🏦', 'bank money'], ['🏨', 'hotel'], ['🏪', 'store shop'],
      ['🏰', 'castle'], ['🗼', 'tower'], ['🗽', 'statue liberty'], ['⛩️', 'shrine'],
      ['🏝️', 'island beach'], ['🏖️', 'beach vacation'], ['🏕️', 'camping tent'], ['🗺️', 'map world'],
      ['🧭', 'compass direction navigate'], ['🚗', 'car'], ['🚕', 'taxi'], ['🚌', 'bus'],
      ['🚲', 'bicycle bike'], ['🛴', 'scooter'], ['🏍️', 'motorcycle'], ['✈️', 'plane flight travel'],
      ['🚀', 'rocket launch ship'], ['🛸', 'ufo'], ['🚂', 'train'], ['🚢', 'ship boat'],
      ['⛵', 'sailboat'], ['🚁', 'helicopter'], ['🛰️', 'satellite'], ['🌆', 'city sunset'],
    ],
  },
  {
    name: 'Activities & objects',
    emoji: [
      ['⚽', 'soccer football'], ['🏀', 'basketball'], ['🏈', 'football'], ['⚾', 'baseball'],
      ['🎾', 'tennis'], ['🏐', 'volleyball'], ['🏓', 'ping pong'], ['🏸', 'badminton'],
      ['🥅', 'goal'], ['⛳', 'golf'], ['🎣', 'fishing'], ['🎿', 'ski'],
      ['🏋️', 'gym workout lift'], ['🧘', 'yoga meditation'], ['🏃', 'run running'], ['🚴', 'cycling'],
      ['🎯', 'target goal darts'], ['🎮', 'game controller'], ['🕹️', 'joystick arcade'], ['🎲', 'dice random'],
      ['🧩', 'puzzle piece'], ['🎨', 'art palette design'], ['🎭', 'theater drama'], ['🎬', 'movie clapper film'],
      ['🎤', 'microphone sing podcast'], ['🎧', 'headphones music'], ['🎵', 'music note'], ['🎸', 'guitar'],
      ['🎹', 'piano keyboard'], ['🥁', 'drum'], ['📱', 'phone mobile'], ['💻', 'laptop computer'],
      ['🖥️', 'desktop monitor'], ['⌨️', 'keyboard'], ['🖱️', 'mouse'], ['💾', 'floppy save'],
      ['💿', 'disc cd'], ['📷', 'camera photo'], ['📹', 'video camera'], ['🔋', 'battery power'],
      ['🔌', 'plug electric'], ['💡', 'idea lightbulb'], ['🔦', 'flashlight'], ['🕯️', 'candle'],
      ['📖', 'book open read'], ['📚', 'books library reading'], ['📕', 'book red'], ['📗', 'book green'],
      ['📘', 'book blue'], ['📙', 'book orange'], ['📓', 'notebook notes'], ['📔', 'journal diary'],
      ['📝', 'memo note write'], ['✏️', 'pencil write edit'], ['🖊️', 'pen write'], ['🖍️', 'crayon'],
      ['📄', 'page document'], ['📃', 'page curl'], ['📑', 'bookmark tabs'], ['📊', 'bar chart analytics'],
      ['📈', 'chart up growth'], ['📉', 'chart down'], ['📋', 'clipboard tasks'], ['📌', 'pin'],
      ['📎', 'paperclip attach'], ['🔗', 'link chain'], ['📁', 'folder'], ['📂', 'folder open'],
      ['🗂️', 'dividers files organize'], ['🗃️', 'card box archive'], ['🗄️', 'file cabinet'], ['🗑️', 'trash delete'],
      ['🔒', 'lock private secure'], ['🔓', 'unlock'], ['🔑', 'key'], ['🗝️', 'old key'],
      ['🔨', 'hammer build'], ['🛠️', 'tools settings build'], ['⚙️', 'gear settings config'], ['🧰', 'toolbox'],
      ['🧲', 'magnet'], ['🧪', 'test tube science lab'], ['🔬', 'microscope research'], ['🔭', 'telescope'],
      ['💊', 'pill medicine'], ['🩺', 'stethoscope health'], ['🛡️', 'shield security'], ['🏆', 'trophy win award'],
      ['🥇', 'gold medal first'], ['🎁', 'gift present'], ['🎈', 'balloon party'], ['🎉', 'party popper celebrate'],
      ['🎊', 'confetti'], ['💰', 'money bag'], ['💳', 'credit card payment'], ['💎', 'gem diamond'],
      ['⚖️', 'scales balance law'], ['🔮', 'crystal ball magic'], ['🧭', 'compass'], ['⏰', 'alarm clock time'],
      ['⏳', 'hourglass time'], ['📅', 'calendar date'], ['📆', 'calendar'], ['🗓️', 'spiral calendar'],
      ['📮', 'mailbox'], ['✉️', 'email envelope mail'], ['📢', 'megaphone announce'], ['🔔', 'bell notification'],
    ],
  },
  {
    name: 'Symbols',
    emoji: [
      ['❤️', 'heart love red'], ['🧡', 'orange heart'], ['💛', 'yellow heart'], ['💚', 'green heart'],
      ['💙', 'blue heart'], ['💜', 'purple heart'], ['🖤', 'black heart'], ['🤍', 'white heart'],
      ['💯', 'hundred perfect'], ['✅', 'check done complete'], ['☑️', 'checkbox done'], ['✔️', 'check mark'],
      ['❌', 'cross no error'], ['⛔', 'no entry stop'], ['⚠️', 'warning caution'], ['🚫', 'prohibited no'],
      ['❓', 'question help'], ['❗', 'exclamation important'], ['💬', 'speech bubble comment'], ['💭', 'thought bubble'],
      ['🔥', 'fire hot'], ['⭕', 'circle'], ['🔴', 'red circle'], ['🟠', 'orange circle'],
      ['🟡', 'yellow circle'], ['🟢', 'green circle'], ['🔵', 'blue circle'], ['🟣', 'purple circle'],
      ['⬛', 'black square'], ['⬜', 'white square'], ['🔺', 'red triangle'], ['🔷', 'blue diamond'],
      ['♻️', 'recycle'], ['⚛️', 'atom science'], ['🔄', 'refresh sync loop'], ['➡️', 'arrow right'],
      ['⬅️', 'arrow left'], ['⬆️', 'arrow up'], ['⬇️', 'arrow down'], ['🔀', 'shuffle'],
      ['▶️', 'play'], ['⏸️', 'pause'], ['⏹️', 'stop'], ['⏺️', 'record'],
      ['🔍', 'search magnify find'], ['🔎', 'search right'], ['🏁', 'checkered flag finish'], ['🚩', 'flag red'],
    ],
  },
];

export const ALL_EMOJI: readonly (readonly [string, string])[] = EMOJI_GROUPS.flatMap((g) => g.emoji);

export function searchEmoji(query: string): (readonly [string, string])[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return ALL_EMOJI.filter(([glyph, keywords]) => keywords.includes(q) || keywords.split(/\s+/).some((k) => k.startsWith(q)) || glyph === q);
}

const RECENT_KEY = 'nook.emoji.recent';
const RECENT_MAX = 24;

export function recentEmoji(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(glyph: string): void {
  try {
    const next = [glyph, ...recentEmoji().filter((e) => e !== glyph)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode) — recents are a convenience only */
  }
}

/** A deterministic emoji for "random" (Notion's dice button). */
export function randomEmoji(): string {
  return ALL_EMOJI[Math.floor(Math.random() * ALL_EMOJI.length)]![0];
}
