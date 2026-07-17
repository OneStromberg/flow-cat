export type Lang = 'ru' | 'en' | 'he';
export const DEFAULT_LANG: Lang = 'ru';

const EN = {
  'nav.checkin': 'Check-in',
  'nav.hours': 'Hours',
  'nav.profile': 'Profile',
  'checkin.title': 'Check in / out',
  'checkin.today': 'Today',
  'checkin.empty': 'No shifts assigned to you today — contact your manager if this is a mistake.',
  'checkin.hi': 'Hi',
  'checkin.photoOptional': 'Photo (optional)',
  'checkin.photoReady': 'Photo ready',
  'checkin.instructions': 'Instructions',
  'checkin.details': 'Details',
  'checkin.address': 'Address',
  'checkin.contact': 'Contact',
  'checkin.navigate': 'Navigate',
  'checkin.checkedInAt': 'Checked in at',
  'checkin.start': 'Check in',
  'checkin.end': 'Check out',
  'checkin.saving': 'Saving…',
  'checkin.outsideZone': 'You are outside the allowed zone.',
  'checkin.geoDenied': 'Location access denied. Please enable location in your browser settings and try again.',
  'checkin.network': 'Network error. Please try again.',
  'checkin.generic': 'Something went wrong. Please try again.',
  'hours.title': 'Hours',
  'hours.total': 'total',
  'hours.attended': 'Attended shifts',
  'hours.noAttended': 'No attended shifts yet.',
  'profile.language': 'Language',
  'profile.langRu': 'Русский',
  'profile.langEn': 'English',
  'profile.langHe': 'עברית',
  'common.logout': 'Log out',
} as const;

export type StringKey = keyof typeof EN;

const RU: Record<StringKey, string> = {
  'nav.checkin': 'Смена',
  'nav.hours': 'Часы',
  'nav.profile': 'Профиль',
  'checkin.title': 'Отметка прихода / ухода',
  'checkin.today': 'Сегодня',
  'checkin.empty': 'На сегодня смен не назначено — свяжитесь с менеджером, если это ошибка.',
  'checkin.hi': 'Привет',
  'checkin.photoOptional': 'Фото (необязательно)',
  'checkin.photoReady': 'Фото готово',
  'checkin.instructions': 'Инструкции',
  'checkin.details': 'Инфо',
  'checkin.address': 'Адрес',
  'checkin.contact': 'Контакт',
  'checkin.navigate': 'Маршрут',
  'checkin.checkedInAt': 'Отметка прихода в',
  'checkin.start': 'Начать смену',
  'checkin.end': 'Завершить смену',
  'checkin.saving': 'Сохранение…',
  'checkin.outsideZone': 'Вы вне разрешённой зоны.',
  'checkin.geoDenied': 'Доступ к геолокации запрещён. Включите геолокацию в настройках браузера и повторите.',
  'checkin.network': 'Ошибка сети. Повторите попытку.',
  'checkin.generic': 'Что-то пошло не так. Повторите попытку.',
  'hours.title': 'Часы',
  'hours.total': 'всего',
  'hours.attended': 'Отработанные смены',
  'hours.noAttended': 'Пока нет отработанных смен.',
  'profile.language': 'Язык',
  'profile.langRu': 'Русский',
  'profile.langEn': 'English',
  'profile.langHe': 'עברית',
  'common.logout': 'Выйти',
};

// Hebrew is completed progressively — Partial is intentional; t() falls back he → en.
const HE: Partial<Record<StringKey, string>> = {
  'nav.checkin': 'משמרת',
  'nav.hours': 'שעות',
  'nav.profile': 'פרופיל',
  'checkin.start': 'התחל משמרת',
  'checkin.end': 'סיים משמרת',
  'checkin.saving': 'שומר…',
  'profile.language': 'שפה',
  'profile.langRu': 'Русский',
  'profile.langEn': 'English',
  'profile.langHe': 'עברית',
  'common.logout': 'התנתק',
  // …remaining HE keys filled progressively; missing ones fall back to EN.
};

const DICT: Record<Lang, Partial<Record<StringKey, string>>> = { en: EN, ru: RU, he: HE };

export function resolveLang(raw: string | undefined | null): Lang {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'en' ? 'en' : v === 'he' ? 'he' : 'ru';
}

export function t(key: StringKey, lang: Lang = DEFAULT_LANG): string {
  return DICT[lang][key] ?? EN[key] ?? key;
}
