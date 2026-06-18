// ITR lookup code tables — sourced from ITR-1, ITR-2, ITR-4 AY 2026-27 Excel utilities

export interface NatureCode {
  code: string;
  description: string;
  group: string;
}

export interface StateCode {
  code: string;
  name: string;
}

export interface TDSSectionCode {
  code: string;
  description: string;
  group: string;
}

// ── Business / nature codes for 44AD ─────────────────────────────────────────
// Source: ITR-4 AY 2026-27 Excel utility — DB sheet (column DX / shared strings)

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
  // Professionals
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

// ── Profession codes for 44ADA ────────────────────────────────────────────────
// Specified professions u/s 44AA(1) of the Income Tax Act

export const PROFESSION_CODES_44ADA: NatureCode[] = [
  { code: '0601', description: 'Chartered Accountants, Auditors, etc.', group: 'Accounting & Finance' },
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

// ── TDS section codes ─────────────────────────────────────────────────────────
// Source: ITR-4 AY 2026-27 Excel utility — DB sheet (column DX)
// Used in Schedule TDS — deductor section field

export const TDS_SECTION_CODES: TDSSectionCode[] = [
  // Salary
  { code: '192', description: 'Salary — payment to employees (non-government)', group: 'Salary' },
  { code: '192A', description: 'TDS on PF withdrawal', group: 'Salary' },
  // Interest
  { code: '193', description: 'Interest on securities', group: 'Interest' },
  { code: '194', description: 'Dividends', group: 'Dividends' },
  { code: '194A', description: "Interest other than 'Interest on securities' (FD, RD, etc.)", group: 'Interest' },
  // Lottery & Games
  { code: '194B', description: 'Winning from lottery or crossword puzzle', group: 'Lottery & Games' },
  { code: '194BA', description: 'Winnings from online games', group: 'Lottery & Games' },
  { code: '194BB', description: 'Winning from horse race', group: 'Lottery & Games' },
  // Contracts & Commission
  { code: '194C', description: 'Payments to contractors and sub-contractors', group: 'Contracts' },
  { code: '194D', description: 'Insurance commission', group: 'Commission' },
  { code: '194DA', description: 'Payment in respect of life insurance policy', group: 'Insurance' },
  { code: '194E', description: 'Payments to non-resident sportsmen or sports associations', group: 'Non-Resident' },
  { code: '194EE', description: 'Payments in respect of deposits under National Savings', group: 'Savings' },
  { code: '194F', description: 'Payments on account of repurchase of units by Mutual Fund / UTI', group: 'Mutual Fund' },
  { code: '194G', description: 'Commission, price, etc. on sale of lottery tickets', group: 'Commission' },
  { code: '194H', description: 'Commission or brokerage', group: 'Commission' },
  { code: '194I(a)', description: 'Rent on hiring of plant and machinery', group: 'Rent' },
  { code: '194I(b)', description: 'Rent on land, building or furniture', group: 'Rent' },
  { code: '194IA', description: 'TDS on sale of immovable property (buyer deducts)', group: 'Property' },
  { code: '194IB', description: 'Payment of rent by certain individuals or HUF (tenant deducts)', group: 'Rent' },
  { code: '194IC', description: 'Payment under joint development agreement', group: 'Property' },
  { code: '194J(a)', description: 'Fees for technical services', group: 'Professional' },
  { code: '194J(b)', description: 'Fees for professional services or royalty', group: 'Professional' },
  { code: '194K', description: 'Income payable to resident in respect of units of mutual fund', group: 'Mutual Fund' },
  { code: '194LA', description: 'Payment of compensation on acquisition of immovable property', group: 'Property' },
  { code: '194LB', description: 'Income by way of interest from infrastructure debt fund', group: 'Infrastructure' },
  { code: '194LC', description: 'Income by way of interest from Indian company — non-resident', group: 'Non-Resident' },
  { code: '194LD', description: 'TDS on interest on bonds / government securities — FII/QFI', group: 'Bonds' },
  { code: '194M', description: 'Payment of certain sums by certain individuals or HUF (>₹50 L)', group: 'Contracts' },
  { code: '194N', description: 'Payment of certain amounts in cash', group: 'Cash' },
  { code: '194O', description: 'Payment of certain sums by e-commerce operator to participant', group: 'E-Commerce' },
  { code: '194P', description: 'Deduction of tax in case of specified senior citizen', group: 'Salary' },
  { code: '194Q', description: 'TDS on purchase of goods above ₹50 lakh', group: 'Goods' },
  { code: '194R', description: 'Benefits or perquisites of business or profession', group: 'Business' },
  { code: '194S', description: 'Payment for transfer of virtual digital assets (VDA / crypto)', group: 'VDA' },
  { code: '195', description: 'Other sums payable to non-resident', group: 'Non-Resident' },
  { code: '196B', description: 'Income from units / long-term capital gain — offshore fund', group: 'Non-Resident' },
  { code: '196C', description: 'Income from foreign currency bonds or GDR', group: 'Non-Resident' },
  { code: '196D', description: 'Income of Foreign Institutional Investors from securities', group: 'Non-Resident' },
  { code: '206C(1)', description: 'TCS on sale of alcoholic liquor for human consumption', group: 'TCS' },
  { code: '206C(1H)', description: 'TCS on sale of goods (above ₹50 lakh, buyer to collect)', group: 'TCS' },
  { code: '206C(1F)', description: 'TCS on sale of motor vehicle above ₹10 lakh', group: 'TCS' },
  { code: '206C(1G)', description: 'TCS on foreign remittance under LRS / overseas tour package', group: 'TCS' },
  { code: '206CCA', description: 'TCS at higher rate for non-filers', group: 'TCS' },
  { code: '206AB', description: 'TDS at higher rate for non-filers of ITR', group: 'Higher Rate' },
  { code: '206AA', description: 'TDS at higher rate for non-furnishing of PAN', group: 'Higher Rate' },
];

// ── State / UT codes ──────────────────────────────────────────────────────────
// Source: ITR-4 AY 2026-27 Excel utility — DB sheet (column EX)

export const STATE_CODES: StateCode[] = [
  { code: '01', name: 'Andaman And Nicobar Islands' },
  { code: '02', name: 'Andhra Pradesh' },
  { code: '03', name: 'Arunachal Pradesh' },
  { code: '04', name: 'Assam' },
  { code: '05', name: 'Bihar' },
  { code: '06', name: 'Chandigarh' },
  { code: '07', name: 'Dadra & Nagar Haveli And Daman & Diu' },
  { code: '09', name: 'Delhi' },
  { code: '10', name: 'Goa' },
  { code: '11', name: 'Gujarat' },
  { code: '12', name: 'Haryana' },
  { code: '13', name: 'Himachal Pradesh' },
  { code: '14', name: 'Jammu And Kashmir' },
  { code: '15', name: 'Karnataka' },
  { code: '16', name: 'Kerala' },
  { code: '17', name: 'Lakshadweep' },
  { code: '18', name: 'Madhya Pradesh' },
  { code: '19', name: 'Maharashtra' },
  { code: '20', name: 'Manipur' },
  { code: '21', name: 'Meghalaya' },
  { code: '22', name: 'Mizoram' },
  { code: '23', name: 'Nagaland' },
  { code: '24', name: 'Odisha' },
  { code: '25', name: 'Puducherry' },
  { code: '26', name: 'Punjab' },
  { code: '27', name: 'Rajasthan' },
  { code: '28', name: 'Sikkim' },
  { code: '29', name: 'Tamil Nadu' },
  { code: '30', name: 'Tripura' },
  { code: '31', name: 'Uttar Pradesh' },
  { code: '32', name: 'West Bengal' },
  { code: '33', name: 'Chhattisgarh' },
  { code: '34', name: 'Uttarakhand' },
  { code: '35', name: 'Jharkhand' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Ladakh' },
];

// ── Employer categories (Schedule S / ITR-1, ITR-2) ──────────────────────────
// Source: ITR-2 AY 2026-27 Excel utility — Schedule S sheet dropdown

export interface EmployerCategory {
  value: string;
  label: string;
  dbCode: string;  // maps to natureOfEmployment in DB
}

export const EMPLOYER_CATEGORIES: EmployerCategory[] = [
  { value: 'govt',       label: 'Government (Central / State)',  dbCode: 'CGOV' },
  { value: 'psu',        label: 'PSU (Public Sector Undertaking)', dbCode: 'PSU' },
  { value: 'pensioners', label: 'Pensioners',                    dbCode: 'PE' },
  { value: 'others',     label: 'Others (Private sector etc.)',  dbCode: 'OTH' },
];

// ── House property types ──────────────────────────────────────────────────────
// Source: ITR-2 AY 2026-27 — House Property sheet

export interface PropertyType {
  value: string;
  label: string;
  hint: string;
  dbCode: string;
}

export const PROPERTY_TYPES: PropertyType[] = [
  {
    value: 'self_occupied',
    label: 'Self Occupied',
    hint: 'Property used by you for your own residence. Annual value is NIL; interest on home loan capped at ₹2 lakh.',
    dbCode: 'S',
  },
  {
    value: 'let_out',
    label: 'Let Out',
    hint: 'Property given on rent. Actual / expected rent is Annual Value; no cap on interest deduction.',
    dbCode: 'L',
  },
  {
    value: 'deemed_let_out',
    label: 'Deemed Let Out',
    hint: 'A second+ property not actually rented out. Treated as if let out at market rent. No cap on interest.',
    dbCode: 'D',
  },
];

// ── Nature of Other Income (Schedule OS) ─────────────────────────────────────
// Predefined categories matching ITR-2 / ITR-4 Schedule OS heads

export interface OtherIncomeType {
  value: string;
  label: string;
  section?: string;
}

export const OTHER_INCOME_TYPES: OtherIncomeType[] = [
  { value: 'gift_cash',       label: 'Gift received in cash (from non-relative)', section: '56(2)(x)' },
  { value: 'gift_immovable',  label: 'Gift of immovable property', section: '56(2)(x)' },
  { value: 'gift_movable',    label: 'Gift of movable property (jewellery, shares etc.)', section: '56(2)(x)' },
  { value: 'subletting',      label: 'Sub-letting of house property', section: '56(2)' },
  { value: 'director_fees',   label: 'Director sitting fees / remuneration', section: '56(2)' },
  { value: 'royalty',         label: 'Royalty income', section: '56(2)' },
  { value: 'annuity',         label: 'Annuity received', section: '56(2)' },
  { value: 'interest_it',     label: 'Interest on income tax refund', section: '56(2)' },
  { value: 'nsc_interest',    label: 'NSC accrued interest (not being accumulated)', section: '56(2)' },
  { value: 'agricultural_other', label: 'Agricultural income from outside India', section: '56(2)' },
  { value: 'esop_unlisted',   label: 'ESOP income (unlisted company) u/s 17(2)(vi)', section: '17(2)' },
  { value: 'keyman_policy',   label: 'Keyman Insurance policy proceeds', section: '56(2)(xi)' },
  { value: 'bullion_prize',   label: 'Cash prize on bullion / jewellery scheme', section: '56(2)' },
  { value: 'vda_other',       label: 'Income from Virtual Digital Assets (VDA/Crypto)', section: '115BBH' },
  { value: 'other',           label: 'Any other income not covered above', section: '56(2)' },
];

// ── Capital gains asset types for STCG — Other ───────────────────────────────

export interface CGAssetType {
  value: string;
  label: string;
  hint?: string;
}

export const STCG_OTHER_ASSET_TYPES: CGAssetType[] = [
  { value: 'land_building',    label: 'Land / Building', hint: 'Held for < 24 months' },
  { value: 'gold_bullion',     label: 'Gold / Bullion / Jewellery', hint: 'Held for < 36 months' },
  { value: 'debt_mf',          label: 'Debt Mutual Fund units (post Apr 2023)', hint: 'No indexation — taxed at slab' },
  { value: 'unlisted_shares',  label: 'Unlisted equity shares', hint: 'Held for < 24 months' },
  { value: 'foreign_shares',   label: 'Foreign shares / ADR / GDR', hint: 'Held for < 24 months' },
  { value: 'bonds_debentures', label: 'Bonds / Debentures (listed or unlisted)', hint: 'Taxed at slab' },
  { value: 'vda',              label: 'Virtual Digital Assets (VDA / Crypto)', hint: 'Taxed at 30% u/s 115BBH' },
  { value: 'other',            label: 'Any other capital asset', hint: '' },
];

// ── Nature of Business codes for ITR-5 (5-digit codes) ───────────────────────
// Source: ITR-5 AY 2026-27 portal schema — PartA_GEN2 NatOfBus dropdown

export const NATURE_OF_BUSINESS_CODES_ITR5: NatureCode[] = [
  // Agriculture
  { code: '01001', description: 'Growing and manufacture of tea', group: 'Agriculture' },
  { code: '01002', description: 'Growing and manufacture of coffee', group: 'Agriculture' },
  { code: '01003', description: 'Growing and manufacture of rubber', group: 'Agriculture' },
  { code: '01004', description: 'Growing of other crops / horticulture', group: 'Agriculture' },
  { code: '01005', description: 'Agriculture — others', group: 'Agriculture' },
  // Mining & Quarrying
  { code: '02001', description: 'Mining of coal and lignite', group: 'Mining & Quarrying' },
  { code: '02002', description: 'Extraction of crude petroleum and natural gas', group: 'Mining & Quarrying' },
  { code: '02003', description: 'Mining of metal ores', group: 'Mining & Quarrying' },
  { code: '02004', description: 'Mining of gems and precious stones', group: 'Mining & Quarrying' },
  { code: '02005', description: 'Other mining and quarrying', group: 'Mining & Quarrying' },
  // Manufacturing — Food, Beverages & Tobacco
  { code: '03001', description: 'Manufacture and processing of food products', group: 'Mfg — Food/Beverages' },
  { code: '03002', description: 'Flour & rice mills', group: 'Mfg — Food/Beverages' },
  { code: '03003', description: 'Sugar manufacturing', group: 'Mfg — Food/Beverages' },
  { code: '03004', description: 'Tea/coffee processing', group: 'Mfg — Food/Beverages' },
  { code: '03005', description: 'Edible oils and vanaspati', group: 'Mfg — Food/Beverages' },
  { code: '03006', description: 'Manufacture of beverages', group: 'Mfg — Food/Beverages' },
  { code: '03007', description: 'Manufacture of tobacco products', group: 'Mfg — Food/Beverages' },
  { code: '03008', description: 'Food processing — others', group: 'Mfg — Food/Beverages' },
  // Manufacturing — Textiles & Leather
  { code: '04001', description: 'Spinning, weaving and finishing of textiles', group: 'Mfg — Textiles' },
  { code: '04002', description: 'Handlooms / powerlooms', group: 'Mfg — Textiles' },
  { code: '04003', description: 'Manufacture of wearing apparel / garments', group: 'Mfg — Textiles' },
  { code: '04004', description: 'Manufacture of leather and leather products', group: 'Mfg — Textiles' },
  { code: '04005', description: 'Textiles, apparel and leather — others', group: 'Mfg — Textiles' },
  // Manufacturing — Wood, Paper & Printing
  { code: '05001', description: 'Sawmilling and planing of wood', group: 'Mfg — Wood/Paper' },
  { code: '05002', description: 'Manufacture of wood and wood products', group: 'Mfg — Wood/Paper' },
  { code: '05003', description: 'Manufacture of paper and paper products', group: 'Mfg — Wood/Paper' },
  { code: '05004', description: 'Printing, publishing and allied activities', group: 'Mfg — Wood/Paper' },
  { code: '05005', description: 'Wood, paper and printing — others', group: 'Mfg — Wood/Paper' },
  // Manufacturing — Chemicals & Pharmaceuticals
  { code: '06001', description: 'Manufacture of basic chemicals', group: 'Mfg — Chemicals' },
  { code: '06002', description: 'Drugs and pharmaceuticals', group: 'Mfg — Chemicals' },
  { code: '06003', description: 'Fertilizers, chemicals and paints', group: 'Mfg — Chemicals' },
  { code: '06004', description: 'Petroleum and petrochemicals', group: 'Mfg — Chemicals' },
  { code: '06005', description: 'Soaps, detergents and cosmetics', group: 'Mfg — Chemicals' },
  { code: '06006', description: 'Chemicals and pharmaceuticals — others', group: 'Mfg — Chemicals' },
  // Manufacturing — Rubber, Plastics & Non-metallic
  { code: '07001', description: 'Manufacture of rubber products (tyres, tubes etc.)', group: 'Mfg — Rubber/Plastics' },
  { code: '07002', description: 'Manufacture of plastics products', group: 'Mfg — Rubber/Plastics' },
  { code: '07003', description: 'Manufacture of cement', group: 'Mfg — Rubber/Plastics' },
  { code: '07004', description: 'Manufacture of glass and glass products', group: 'Mfg — Rubber/Plastics' },
  { code: '07005', description: 'Marble and granite', group: 'Mfg — Rubber/Plastics' },
  { code: '07006', description: 'Rubber, plastics and non-metallic — others', group: 'Mfg — Rubber/Plastics' },
  // Manufacturing — Metals & Engineering
  { code: '08001', description: 'Manufacture of basic metals (iron, steel)', group: 'Mfg — Metals/Engg' },
  { code: '08002', description: 'Manufacture of non-ferrous metals', group: 'Mfg — Metals/Engg' },
  { code: '08003', description: 'Manufacture of fabricated metal products', group: 'Mfg — Metals/Engg' },
  { code: '08004', description: 'Manufacture of machinery and equipment', group: 'Mfg — Metals/Engg' },
  { code: '08005', description: 'Manufacture of motor vehicles and auto parts', group: 'Mfg — Metals/Engg' },
  { code: '08006', description: 'Electronics including computer hardware', group: 'Mfg — Metals/Engg' },
  { code: '08007', description: 'Engineering goods — others', group: 'Mfg — Metals/Engg' },
  // Trading
  { code: '09001', description: 'Trading — retail', group: 'Trading' },
  { code: '09002', description: 'Trading — wholesale', group: 'Trading' },
  { code: '09003', description: 'Dealing in motor vehicles', group: 'Trading' },
  { code: '09004', description: 'Dealing in fuels / petroleum products', group: 'Trading' },
  { code: '09005', description: 'Import / export trading', group: 'Trading' },
  { code: '09006', description: 'Trading — others', group: 'Trading' },
  // Construction & Real Estate
  { code: '10001', description: 'Construction of buildings', group: 'Construction/Real Estate' },
  { code: '10002', description: 'Civil engineering and infrastructure', group: 'Construction/Real Estate' },
  { code: '10003', description: 'Real estate developers / builders', group: 'Construction/Real Estate' },
  { code: '10004', description: 'Real estate agents and brokers', group: 'Construction/Real Estate' },
  { code: '10005', description: 'Construction and real estate — others', group: 'Construction/Real Estate' },
  // Utilities & Energy
  { code: '11001', description: 'Production and distribution of electricity', group: 'Utilities & Energy' },
  { code: '11002', description: 'Manufacture and supply of gas / steam', group: 'Utilities & Energy' },
  { code: '11003', description: 'Water supply and treatment', group: 'Utilities & Energy' },
  { code: '11004', description: 'Waste collection and management', group: 'Utilities & Energy' },
  { code: '11005', description: 'Power and energy — others', group: 'Utilities & Energy' },
  // Transport, Storage & Logistics
  { code: '12001', description: 'Land transport (road, railways)', group: 'Transport & Logistics' },
  { code: '12002', description: 'Goods carriage / freight', group: 'Transport & Logistics' },
  { code: '12003', description: 'Water transport', group: 'Transport & Logistics' },
  { code: '12004', description: 'Air transport', group: 'Transport & Logistics' },
  { code: '12005', description: 'Warehousing and storage', group: 'Transport & Logistics' },
  { code: '12006', description: 'Postal and courier services', group: 'Transport & Logistics' },
  { code: '12007', description: 'Travel agents and tour operators', group: 'Transport & Logistics' },
  { code: '12008', description: 'Transport and logistics — others', group: 'Transport & Logistics' },
  // Hotels & Restaurants
  { code: '13001', description: 'Hotels, resorts and similar accommodation', group: 'Hotels & Restaurants' },
  { code: '13002', description: 'Restaurants, cafes and food service', group: 'Hotels & Restaurants' },
  { code: '13003', description: 'Catering services', group: 'Hotels & Restaurants' },
  { code: '13004', description: 'Hotels and restaurants — others', group: 'Hotels & Restaurants' },
  // Information Technology & Communication
  { code: '14001', description: 'Software development', group: 'IT & Communication' },
  { code: '14002', description: 'IT enabled services / BPO', group: 'IT & Communication' },
  { code: '14003', description: 'Telecommunications', group: 'IT & Communication' },
  { code: '14004', description: 'E-commerce', group: 'IT & Communication' },
  { code: '14005', description: 'Cable TV, DTH and broadcasting', group: 'IT & Communication' },
  { code: '14006', description: 'IT and communication — others', group: 'IT & Communication' },
  // Financial Services
  { code: '15001', description: 'Banking companies', group: 'Financial Services' },
  { code: '15002', description: 'Insurance companies', group: 'Financial Services' },
  { code: '15003', description: 'Non-banking finance companies (NBFC)', group: 'Financial Services' },
  { code: '15004', description: 'Share brokers and sub-brokers', group: 'Financial Services' },
  { code: '15005', description: 'Chit funds', group: 'Financial Services' },
  { code: '15006', description: 'Money lending', group: 'Financial Services' },
  { code: '15007', description: 'Leasing companies', group: 'Financial Services' },
  { code: '15008', description: 'Mutual funds / investment trusts', group: 'Financial Services' },
  { code: '15009', description: 'Financial services — others', group: 'Financial Services' },
  // Professional Services
  { code: '16001', description: 'Legal services', group: 'Professional Services' },
  { code: '16002', description: 'Chartered accountants, auditors and tax consultants', group: 'Professional Services' },
  { code: '16003', description: 'Architectural and engineering services', group: 'Professional Services' },
  { code: '16004', description: 'Scientific research and development', group: 'Professional Services' },
  { code: '16005', description: 'Advertising and market research', group: 'Professional Services' },
  { code: '16006', description: 'Management consultancy', group: 'Professional Services' },
  { code: '16007', description: 'Fashion designers', group: 'Professional Services' },
  { code: '16008', description: 'Professional services — others', group: 'Professional Services' },
  // Education
  { code: '17001', description: 'Primary and secondary education', group: 'Education' },
  { code: '17002', description: 'Higher education (colleges/universities)', group: 'Education' },
  { code: '17003', description: 'Technical and vocational training', group: 'Education' },
  { code: '17004', description: 'Computer training and coaching institutes', group: 'Education' },
  { code: '17005', description: 'Education — others', group: 'Education' },
  // Health & Medical
  { code: '18001', description: 'Hospitals and nursing homes', group: 'Health & Medical' },
  { code: '18002', description: 'Clinics and dispensaries', group: 'Health & Medical' },
  { code: '18003', description: 'Pathology labs and diagnostic centres', group: 'Health & Medical' },
  { code: '18004', description: 'Medical professionals (doctors, dentists)', group: 'Health & Medical' },
  { code: '18005', description: 'Manufacture / dealing in medical equipment', group: 'Health & Medical' },
  { code: '18006', description: 'Health and medical — others', group: 'Health & Medical' },
  // Arts, Entertainment & Recreation
  { code: '19001', description: 'Motion picture production and distribution', group: 'Arts & Entertainment' },
  { code: '19002', description: 'Television channels and radio broadcasting', group: 'Arts & Entertainment' },
  { code: '19003', description: 'Music and performing arts', group: 'Arts & Entertainment' },
  { code: '19004', description: 'Sports clubs and recreation activities', group: 'Arts & Entertainment' },
  { code: '19005', description: 'Amusement parks and gaming', group: 'Arts & Entertainment' },
  { code: '19006', description: 'Religious organisations', group: 'Arts & Entertainment' },
  { code: '19007', description: 'Educational institutions (schools/trusts)', group: 'Arts & Entertainment' },
  { code: '19008', description: 'Health and medical services (charitable)', group: 'Arts & Entertainment' },
  { code: '19009', description: 'Social / community service organisations', group: 'Arts & Entertainment' },
  // Other Service Activities
  { code: '20001', description: 'Repair of computers and household goods', group: 'Other Services' },
  { code: '20002', description: 'Laundry, cleaning and dyeing', group: 'Other Services' },
  { code: '20003', description: 'Beauty parlours and barber shops', group: 'Other Services' },
  { code: '20004', description: 'Security agencies', group: 'Other Services' },
  { code: '20005', description: 'Placement and staffing agencies', group: 'Other Services' },
  { code: '20006', description: 'Other services — others', group: 'Other Services' },
  // Trusts, NGOs, Associations & Societies
  { code: '21001', description: 'Charitable trusts (registered u/s 12A/12AA)', group: 'Trusts & NGOs' },
  { code: '21002', description: 'Religious trusts', group: 'Trusts & NGOs' },
  { code: '21003', description: 'Sporting associations', group: 'Trusts & NGOs' },
  { code: '21004', description: 'Trade unions', group: 'Trusts & NGOs' },
  { code: '21005', description: 'Political parties', group: 'Trusts & NGOs' },
  { code: '21006', description: 'Activities of membership organisations', group: 'Trusts & NGOs' },
  { code: '21007', description: 'Cooperative societies', group: 'Trusts & NGOs' },
  { code: '21008', description: 'Other personal service activities / societies', group: 'Trusts & NGOs' },
  { code: '21009', description: 'Activities of households as employers', group: 'Trusts & NGOs' },
  // Others
  { code: '99999', description: 'Others (not elsewhere classified)', group: 'Others' },
];

// ── Helper utilities ──────────────────────────────────────────────────────────

export function getCodeLabel(code: string, list: NatureCode[]): string {
  const found = list.find(c => c.code === code);
  return found ? `${found.code} – ${found.description}` : code;
}

export function getStateName(code: string): string {
  return STATE_CODES.find(s => s.code === code)?.name ?? code;
}

export function getTDSDescription(code: string): string {
  return TDS_SECTION_CODES.find(t => t.code === code)?.description ?? code;
}
