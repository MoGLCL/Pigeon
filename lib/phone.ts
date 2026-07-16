export const INTERNATIONAL_PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

export function isInternationalPhone(value: string) {
  return INTERNATIONAL_PHONE_PATTERN.test(value.trim());
}

export function splitInternationalPhones(value: string) {
  return [...new Set(value.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean))];
}
