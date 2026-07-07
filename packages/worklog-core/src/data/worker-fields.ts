export const TRANSPORTATION = [
  { value: 'nothing', label: 'Nothing' },
  { value: 'car', label: 'Car' },
  { value: 'electric_bicycle', label: 'Electric bicycle' },
] as const;

export const HEBREW_LEVEL = [
  { value: 'read_write', label: 'Read & write' },
  { value: 'speaks_good', label: 'Speaks good' },
  { value: 'mid', label: 'Mid speaking level' },
  { value: 'badly', label: 'Speaks badly' },
  { value: 'none', label: "Doesn't know Hebrew" },
] as const;

export const PAY_TYPE = [
  { value: 'full', label: 'Full salary' },
  { value: 'amount', label: 'Specific amount' },
  { value: 'none', label: "Can't receive money" },
] as const;

export const SCHEDULE = [
  { value: 'days', label: 'Days' },
  { value: 'nights', label: 'Nights' },
  { value: 'all', label: 'All' },
] as const;

export const GENDER = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
] as const;

// Embedded city list for worker registration. value = Hebrew (canonical, matches
// existing place/worker city data); label = "Русский — עברית" for bilingual pick.
export const CITIES = [
  { value: 'ירושלים', label: 'Иерусалим — ירושלים' },
  { value: 'תל אביב-יפו', label: 'Тель-Авив — תל אביב-יפו' },
  { value: 'חיפה', label: 'Хайфа — חיפה' },
  { value: 'ראשון לציון', label: 'Ришон-ле-Цион — ראשון לציון' },
  { value: 'פתח תקווה', label: 'Петах-Тиква — פתח תקווה' },
  { value: 'אשדוד', label: 'Ашдод — אשדוד' },
  { value: 'נתניה', label: 'Нетания — נתניה' },
  { value: 'באר שבע', label: 'Беэр-Шева — באר שבע' },
  { value: 'בני ברק', label: 'Бней-Брак — בני ברק' },
  { value: 'חולון', label: 'Холон — חולון' },
  { value: 'רמת גן', label: 'Рамат-Ган — רמת גן' },
  { value: 'רחובות', label: 'Реховот — רחובות' },
  { value: 'אשקלון', label: 'Ашкелон — אשקלון' },
  { value: 'בת ים', label: 'Бат-Ям — בת ים' },
  { value: 'כפר סבא', label: 'Кфар-Сава — כפר סבא' },
  { value: 'הרצליה', label: 'Герцлия — הרצליה' },
  { value: 'חדרה', label: 'Хадера — חדרה' },
  { value: 'לוד', label: 'Лод — לוד' },
  { value: 'רמלה', label: 'Рамла — רמלה' },
  { value: 'רעננה', label: 'Раанана — רעננה' },
  { value: 'אילת', label: 'Эйлат — אילת' },
  { value: 'עכו', label: 'Акко — עכו' },
  { value: 'קריית גת', label: 'Кирьят-Гат — קריית גת' },
  { value: 'עפולה', label: 'Афула — עפולה' },
  { value: 'טבריה', label: 'Тверия — טבריה' },
  { value: 'ראש העין', label: 'Рош-ха-Аин — ראש העין' },
  { value: 'ערד', label: 'Арад — ערד' },
] as const;
