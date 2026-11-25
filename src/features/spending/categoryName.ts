import { useTranslation } from 'react-i18next';

/**
 * The name of a category id. The shared `category` namespace comes first; the ids the back end allows
 * but that namespace does not name yet (clothing, entertainment, taxes, cash, transfers) are named in
 * `spending.categoryNames`; an unknown id is shown as it is.
 */
export function useCategoryName() {
  const { t } = useTranslation();
  return (category: string | null | undefined) => {
    if (!category) return t('category.none');
    return t(`category.${category}`, { defaultValue: t(`spending.categoryNames.${category}`, { defaultValue: category }) });
  };
}
