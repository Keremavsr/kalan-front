import { useTranslation } from 'react-i18next';

/** Ids the back end uses for "no category": all of them read as the translated "Kategorisiz", never as the raw id. */
export const NO_CATEGORY = new Set(['', 'uncategorized', 'none', 'unknown']);

export function isUncategorized(category: string | null | undefined) {
  return !category || NO_CATEGORY.has(category);
}

/**
 * The name of a category id from the shared `category` namespace. An id with no translation is shown
 * in a readable form ("pet_care" as "Pet care"), never as the raw snake-case id.
 */
export function useCategoryName() {
  const { t } = useTranslation();
  return (category: string | null | undefined) => {
    if (isUncategorized(category)) return t('category.none');
    const id = category as string;
    const readable = id.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    return t(`category.${id}`, { defaultValue: readable });
  };
}
