// ITR business / profession nature codes — sourced from ITR-4 AY 2026-27 Excel utility (DB sheet)

export interface NatureCode {
  code: string;
  description: string;
  group: string;
}

// Groups used for 44AD (business income)
export const BUSINESS_CODES_44AD: NatureCode[] = [
  // Manufacturing
  { code: '0101', description: 'Agro-based industries', group: 'Manufacturing' },
  { code: '0102', description: 'Automobile and Auto parts', group: 'Manufacturing' },
  { code: '0103', description: 'Cement', group: 'Manufacturing' },
  { code: '0104', description: 'Diamond cutting', group: 'Manufacturing' },
  { code: '0105', description: 'Drugs and Pharmaceuticals', group: 'Manufacturing' },
  { code: '0106', description: 'Electronics including Computer Hardware', group: 'Manufacturing' },
  { code: '0107', description: 'Engineering goods', group: 'Manufacturing' },
  { code: '0108', description: 'Fertilizers, Chemicals, Paints', group: 'Manufacturing' },
  { code: '0109', description: 'Flour & Rice Mills', group: 'Manufacturing' },
  { code: '0110', description: 'Food Processing units', group: 'Manufacturing' },
  { code: '0111', description: 'Marble & Granite', group: 'Manufacturing' },
  { code: '0112', description: 'Paper', group: 'Manufacturing' },
  { code: '0113', description: 'Petroleum and Petrochemicals', group: 'Manufacturing' },
  { code: '0114', description: 'Power and energy', group: 'Manufacturing' },
  { code: '0115', description: 'Printing & Publishing', group: 'Manufacturing' },
  { code: '0116', description: 'Rubber', group: 'Manufacturing' },
  { code: '0117', description: 'Steel', group: 'Manufacturing' },
  { code: '0118', description: 'Sugar', group: 'Manufacturing' },
  { code: '0119', description: 'Tea, Coffee', group: 'Manufacturing' },
  { code: '0120', description: 'Textiles, handloom, Power looms', group: 'Manufacturing' },
  { code: '0121', description: 'Tobacco', group: 'Manufacturing' },
  { code: '0122', description: 'Tyre', group: 'Manufacturing' },
  { code: '0123', description: 'Vanaspati & Edible Oils', group: 'Manufacturing' },
  { code: '0124', description: 'Manufacturing Industry – Others', group: 'Manufacturing' },
  // Trading
  { code: '0201', description: 'Chain Stores', group: 'Trading' },
  { code: '0202', description: 'Retailers', group: 'Trading' },
  { code: '0203', description: 'Wholesalers', group: 'Trading' },
  { code: '0204', description: 'Trading – Others', group: 'Trading' },
  // Commission
  { code: '0301', description: 'General Commission Agents', group: 'Commission' },
  // Real Estate
  { code: '0401', description: 'Builders', group: 'Real Estate' },
  { code: '0402', description: 'Estate Agents', group: 'Real Estate' },
  { code: '0403', description: 'Property Developers', group: 'Real Estate' },
  { code: '0404', description: 'Builders – Others', group: 'Real Estate' },
  // Contractors
  { code: '0501', description: 'Civil Contractors', group: 'Contractors' },
  { code: '0502', description: 'Excise Contractors', group: 'Contractors' },
  { code: '0503', description: 'Forest Contractors', group: 'Contractors' },
  { code: '0504', description: 'Mining Contractors', group: 'Contractors' },
  { code: '0505', description: 'Contractors – Others', group: 'Contractors' },
  // Professionals (listed under business)
  { code: '0601', description: 'Chartered Accountants, Auditors, etc.', group: 'Professionals' },
  { code: '0602', description: 'Fashion designers', group: 'Professionals' },
  { code: '0603', description: 'Legal professionals', group: 'Professionals' },
  { code: '0604', description: 'Medical professionals', group: 'Professionals' },
  { code: '0605', description: 'Nursing Homes', group: 'Professionals' },
  { code: '0606', description: 'Specialty hospitals', group: 'Professionals' },
  { code: '0607', description: 'Professionals – Others', group: 'Professionals' },
  // Service Sector
  { code: '0701', description: 'Advertisement agencies', group: 'Service Sector' },
  { code: '0702', description: 'Beauty Parlours', group: 'Service Sector' },
  { code: '0703', description: 'Consultancy services', group: 'Service Sector' },
  { code: '0704', description: 'Courier Agencies', group: 'Service Sector' },
  { code: '0705', description: 'Computer training / educational and coaching institutes', group: 'Service Sector' },
  { code: '0706', description: 'Forex Dealers', group: 'Service Sector' },
  { code: '0707', description: 'Hospitality services', group: 'Service Sector' },
  { code: '0708', description: 'Hotels', group: 'Service Sector' },
  { code: '0709', description: 'I.T. enabled services, BPO service providers', group: 'Service Sector' },
  { code: '0710', description: 'Security agencies', group: 'Service Sector' },
  { code: '0711', description: 'Software development agencies', group: 'Service Sector' },
  { code: '0712', description: 'Transporters', group: 'Service Sector' },
  { code: '0713', description: 'Travel agents, tour operators', group: 'Service Sector' },
  { code: '0714', description: 'Service Sector – Others', group: 'Service Sector' },
  // Financial Services
  { code: '0801', description: 'Banking Companies', group: 'Financial Services' },
  { code: '0802', description: 'Chit Funds', group: 'Financial Services' },
  { code: '0803', description: 'Financial Institutions', group: 'Financial Services' },
  { code: '0804', description: 'Financial service providers', group: 'Financial Services' },
  { code: '0805', description: 'Leasing Companies', group: 'Financial Services' },
  { code: '0806', description: 'Money Lenders', group: 'Financial Services' },
  { code: '0807', description: 'Non-Banking Finance Companies', group: 'Financial Services' },
  { code: '0808', description: 'Share Brokers, Sub-brokers, etc.', group: 'Financial Services' },
  { code: '0809', description: 'Financial Services Sector – Others', group: 'Financial Services' },
  // Entertainment
  { code: '0901', description: 'Cable T.V. Productions', group: 'Entertainment' },
  { code: '0902', description: 'Film distribution', group: 'Entertainment' },
  { code: '0903', description: 'Film laboratories', group: 'Entertainment' },
  { code: '0904', description: 'Motion Picture Producers', group: 'Entertainment' },
  { code: '0905', description: 'Television Channels', group: 'Entertainment' },
  { code: '0906', description: 'Entertainment Industry – Others', group: 'Entertainment' },
  // Others
  { code: '1001', description: 'Other Sector', group: 'Others' },
  { code: '9999', description: 'Others', group: 'Others' },
];

// Profession codes for 44ADA — specified professions u/s 44AA(1)
export const PROFESSION_CODES_44ADA: NatureCode[] = [
  { code: '0601', description: 'Chartered Accountants, Auditors, etc.', group: 'Accounting' },
  { code: '0603', description: 'Legal professionals', group: 'Legal' },
  { code: '0604', description: 'Medical professionals', group: 'Medical' },
  { code: '0605', description: 'Nursing Homes', group: 'Medical' },
  { code: '0606', description: 'Specialty hospitals', group: 'Medical' },
  { code: '0602', description: 'Fashion designers', group: 'Design & Arts' },
  { code: '0703', description: 'Consultancy services', group: 'Technical' },
  { code: '0705', description: 'Computer training / educational and coaching institutes', group: 'Technical' },
  { code: '0709', description: 'I.T. enabled services, BPO service providers', group: 'Technical' },
  { code: '0711', description: 'Software development agencies', group: 'Technical' },
  { code: '0607', description: 'Professionals – Others', group: 'Others' },
  { code: '9999', description: 'Others', group: 'Others' },
];

export function getCodeLabel(code: string, list: NatureCode[]): string {
  const found = list.find(c => c.code === code);
  return found ? `${found.code} – ${found.description}` : code;
}
