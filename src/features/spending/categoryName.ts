import { useTranslation } from 'react-i18next';

/** The name of a category id from the shared `category` namespace; an unknown id is shown as it is. */
export function useCategoryName() {
  const { t } = useTranslation();
  return (category: string | null | undefined) => {
    if (!category) return t('category.none');
    return t(`category.${category}`, { defaultValue: category });
  };
}
