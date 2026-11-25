// Display names for parser ids. Unknown ids are shown as they come.
const BANKS: Record<string, string> = {
  ornekbank: 'Örnekbank',
  denemebank: 'Denemebank',
  vakifbank: 'VakıfBank',
  garanti: 'Garanti BBVA',
  yapikredi: 'Yapı Kredi',
  isbank: 'İş Bankası',
  akbank: 'Akbank',
  qnb: 'QNB',
  ziraat: 'Ziraat Bankası',
};

export function bankName(id: string): string {
  return BANKS[id] ?? id;
}
