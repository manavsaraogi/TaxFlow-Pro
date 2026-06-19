import json, copy, re, sys

itr_path = 'C:/Client/Income Tax/Navshaala Foundation/ITR-5-AAETN3872B-AY2026-27.json'
schema_path = 'C:/Client/Income Tax/Navshaala Foundation/ITR Tools/ITR-5_2025_Main_V1.2.json'

itr = json.load(open(itr_path, encoding='utf-8'))
schema = json.load(open(schema_path, encoding='utf-8'))
i5 = itr['ITR']['ITR5']

# ── helpers ────────────────────────────────────────────────────────────────────
# ScheduleOS uses Up16Of6To15Of9; AccruOrRecOfCG uses Upto15Of9 — different schemas
DR_OS = {'DateRange': {'Upto15Of6': 0, 'Up16Of6To15Of9': 0, 'Up16Of9To15Of12': 0,
                       'Up16Of12To15Of3': 0, 'Up16Of3To31Of3': 0}}
DR_CG = {'DateRange': {'Upto15Of6': 0, 'Upto15Of9': 0, 'Up16Of9To15Of12': 0,
                       'Up16Of12To15Of3': 0, 'Up16Of3To31Of3': 0}}
DR0 = DR_OS
DED48_0 = {'Reduction48iii': 0, 'AquisitCost': 0, 'ImproveCost': 0, 'ExpOnTrans': 0, 'TotalDedn': 0}
EXC_VAT_0 = {'UnionExciseDuty': 0, 'ServiceTax': 0, 'VATorSaleTax': 0, 'CentralGoodServiceTax': 0,
              'StateGoodServiceTax': 0, 'IntegratedGoodServiceTax': 0, 'UnionTerrGoodServiceTax': 0,
              'OthDutyTaxCess': 0, 'TotExciseCustomsVAT': 0}
LOSS_TOT_0 = {'StclSetoff15Per': 0, 'StclSetoff20Per': 0, 'StclSetoff30Per': 0,
               'StclSetoffAppRate': 0, 'StclSetoffDTAARate': 0,
               'LtclSetOff10Per': 0, 'LtclSetOff12_5Per': 0, 'LtclSetOff20Per': 0, 'LtclSetOffDTAARate': 0}

# ── 1. ScheduleCYLA — strip portal-rejected per-head setoff fields ─────────────
for head, val in i5['ScheduleCYLA'].items():
    if isinstance(val, dict) and 'IncCYLA' in val:
        for f in ['HPlossCurYrSetoff', 'BusLossSetoff', 'OthSrcLossNoRaceHorseSetoff',
                  'STCGLossSetoff', 'LTCGLossSetoff']:
            val['IncCYLA'].pop(f, None)

# ── 2. ScheduleBFLA OthSrcExclRaceHorse — strip BFlossPrevYrUndSameHeadSetoff ──
osr = i5['ScheduleBFLA'].get('OthSrcExclRaceHorse', {})
if 'IncBFLA' in osr:
    osr['IncBFLA'].pop('BFlossPrevYrUndSameHeadSetoff', None)

# ── 3. PARTA_BS CurrLiabilitiesProv rename ────────────────────────────────────
clp = i5['PARTA_BS']['FundApply']['CurrAssetLoanAdv']['CurrLiabilitiesProv']
if 'TotCurrLiabilitiesProv' in clp:
    clp['TotCurrLiabilitiesProvision'] = clp.pop('TotCurrLiabilitiesProv')

# ── 4. PARTA_BS MiscAdjust int → object ──────────────────────────────────────
ma = i5['PARTA_BS']['FundApply'].get('MiscAdjust', 0)
if not isinstance(ma, dict):
    i5['PARTA_BS']['FundApply']['MiscAdjust'] = {
        'MiscExpndr': 0, 'DefTaxAsset': 0, 'AccumultedLosses': ma, 'TotMiscAdjust': ma}

# ── 5. PARTA_PL fixes ─────────────────────────────────────────────────────────
pl = i5['PARTA_PL']
pbt = pl.get('CreditsToPL', {}).get('TotCreditsToPL', 0)

pl['DebitsToPL']['DebitPlAcnt'] = {
    'Freight': 0, 'ConsumptionOfStores': 0, 'PowerFuel': 0,
    'RentExpdr': 0, 'RepairsBldg': 0, 'RepairMach': 0,
    'EmployeeComp': {'SalsWages': 0, 'Bonus': 0, 'MedExpReimb': 0, 'LeaveEncash': 0,
                     'LeaveTravelBenft': 0, 'ContToSuperAnnFund': 0, 'ContToPF': 0,
                     'ContToGratFund': 0, 'ContToOthFund': 0, 'OthEmpBenftExpdr': 0,
                     'TotEmployeeComp': 0},
    'Insurances': {'MedInsur': 0, 'LifeInsur': 0, 'KeyManInsur': 0, 'OthInsur': 0, 'TotInsurances': 0},
    'StaffWelfareExp': 0, 'Entertainment': 0, 'Hospitality': 0,
    'Conference': 0, 'SalePromoExp': 0, 'Advertisement': 0,
    'CommissionExpdrDtls': {'NonResOtherCompany': 0, 'Others': 0, 'Total': 0},
    'RoyalityDtls': {'NonResOtherCompany': 0, 'Others': 0, 'Total': 0},
    'ProfessionalConstDtls': {'NonResOtherCompany': 0, 'Others': 0, 'Total': 0},
    'HotelBoardLodge': 0, 'TravelExp': 0, 'ForeignTravelExp': 0,
    'ConveyanceExp': 0, 'TelephoneExp': 0, 'GuestHouseExp': 0,
    'ClubExp': 0, 'FestivalCelebExp': 0, 'Scholarship': 0, 'Gift': 0, 'Donation': 0,
    'RatesTaxesPays': {'ExciseCustomsVAT': copy.deepcopy(EXC_VAT_0)},
    'AuditFee': 0, 'SalRemuneration': 0, 'OtherExpenses': 0,
    'BadDebtDtls': {'BadDebtAmtDtlsTotal': 0, 'OthersPANNotAvlblDtlTotal': 0,
                    'OthersAmtLt1Lakh': 0, 'BadDebt': 0},
    'ProvForBadDoubtDebt': 0, 'OthProvisionsExpdr': 0,
    'PBIDTA': pbt,
    'InterestExpdrtDtls': {'NonResOtherCompany': 0, 'Others': 0, 'ResPartners': 0,
                           'ResOthers': 0, 'InterestExpdr': 0},
    'DepreciationAmort': 0, 'PBT': pbt,
}

pl['DebitsToPL']['TaxProvAppr'] = {
    'ProvForCurrTax': 0, 'ProvDefTax': 0, 'ProfitAfterTax': pbt,
    'BalBFPrevYr': 0, 'AmtAvlAppr': pbt,
    'Appropriations': {'TrfToReserves': 0},    # required field
    'PartnerAccBalTrf': 0,
}

pl['NoBooksOfAccPL'] = {
    'GrossReceipt': 0, 'GrsRcptAccPayeeOrBankMode': 0, 'GrsRcptOtherMode': 0,
    'GrossProfit': 0, 'Expenses': 0, 'NetProfit': 0,
    'GrossReceiptPrf': 0, 'GrsRcptAccPayeeOrBankModePrf': 0, 'GrsRcptOtherModePrf': 0,
    'GrossProfitPrf': 0, 'ExpensesPrf': 0, 'NetProfitPrf': 0, 'TotBusinessProfession': 0,
}
pl['PersumptiveInc44AD'] = {'GrsTrnOverOrReceipt': 0, 'TotPersumptiveInc44AD': 0}
pl['PersumptiveInc44ADA'] = {'GrsReceipt': 0}

# ── 6. CorpScheduleBP — complete restructure ──────────────────────────────────
net = pbt
i5['CorpScheduleBP'] = {
    'BusinessIncOthThanSpec': {
        'ProfBfrTaxPL': net,
        'NetPLFromSpecBus': 0,
        'NetProfLossSpecifiedBus': 0,
        'IncRecCredPLOthHeadDtls': {
            'HouseProperty': 0, 'CapitalGains': 0, 'OtherSources': 0,
            'UnderSec115BBF': 0, 'UnderSec115BBG': 0, 'Dividend': 0, 'OtherThanDividend': 0},
        'PLUs44sChapXIIGOthrUs115B': 0,
        'ProfitLossInclRefrdSec': {
            'ProfitLossUs44AD': 0, 'ProfitLossUs44ADA': 0, 'ProfitLossUs44AE': 0,
            'ProfitLossUs44B': 0, 'ProfitLossUs44BB': 0, 'ProfitLossUs44BBA': 0,
            'ProfitLossUs44BBC': 0, 'ProfitLossUs44DA': 0, 'FirstSchITActOthr115B': 0},
        'TotalProfitFrmActCvrd': 0,
        'ProfitFrmActCvrd': {
            'ProfitFrmActCvrdUndrRule7': 0, 'ProfitFrmActCvrdUndrRule7A': 0,
            'ProfitFrmActCvrdUndrRule7B1': 0, 'ProfitFrmActCvrdUndrRule7B1A': 0,
            'ProfitFrmActCvrdUndrRule8': 0},
        'IncCredPL': {'FirmShareInc': 0, 'AOPBOISharInc': 0, 'OthExempInc': 0, 'TotExempInc': 0},
        'BalancePLOthThanSpecBus': net,
        'ExpDebToPLOthHeadDtls': {
            'HouseProperty': 0, 'CapitalGains': 0, 'OtherSources': 0,
            'UnderSec115BBF': 0, 'UnderSec115BBG': 0},
        'ExpDebToPLExemptInc': 0,
        'ExpDebToPLExemptIncDisAllwUs14A': 0,
        'TotExpDebPL': 0,
        'AdjustedPLOthThanSpecBus': net,
        'DepreciationDebPLCosAct': 0,
        'DepreciationAllowITAct32': {
            'DepreciationAllowUs32_1_ii': 0, 'DepreciationAllowUs32_1_i': 0, 'TotDeprAllowITAct': 0},
        'AdjustPLAfterDeprOthSpecInc': net,
        'AmtDebPLDisallowUs36': 0, 'AmtDebPLDisallowUs37': 0,
        'AmtDebPLDisallowUs40': 0, 'AmtDebPLDisallowUs40A': 0, 'AmtDebPLDisallowUs43B': 0,
        'InterestDisAllowUs23SMEAct': 0, 'DeemIncUs41': 0, 'DeemIncUs3380HHD80IA': 0, 'DeemIncUs43CA': 0,
        'OthItemDisallowUs28To44DB': 0, 'AnyOthIncNotInclInExpDisallowPL': 0,
        'SalaryExpDisallowPL': 0, 'BonusExpDisallowPL': 0, 'CommissionExpDisallowPL': 0,
        'InterestExpDisallowPL': 0, 'OthersExpDisallowPL': 0,
        'IncProfDecLossAccICDSAdj': 0,
        'TotAfterAddToPLDeprOthSpecInc': net,
        'DeductUs32_1_iii': 0, 'DebPLUs35ExcessAmt': 0,
        'AmtDisallUs40NowAllow': 0, 'AmtDisallUs43BNowAllow': 0, 'AnyOthAmtAllDeduct': 0,
        'DecProfIncLossAccICDSAdj': 0, 'TotDeductionAmts': 0,
        'PLAftAdjDedBusOthThanSpec': net,
        'DeemedProfitBusUs': {
            'Section44AD': 0, 'Section44ADA': 0, 'Section44AE': 0,
            'Section44B': 0, 'Section44BB': 0, 'Section44BBA': 0, 'Section44BBC': 0,
            'Section44DA': 0, 'FirstSchTActOther': 0, 'TotDeemedProfitBusUs': 0},
        'NetPLAftAdjBusOthThanSpec': net,
        'NetPLBusOthThanSpec7A7B7C': net,
        'ChrgblIncUndrRule7': 0, 'DeemedChrgblIncUndrRule7A': 0,
        'DeemedChrgblIncUndrRule7B1': 0, 'DeemedChrgblIncUndrRule7B1A': 0,
        'DeemedChrgblIncUndrRule8': 0,
        'IncomeOtherThanRule': net,
        'BalIncDeemedFrmAgri': 0,
    },
    'SpecBusinessInc': {
        'NetPLFrmSpecBus': 0, 'AdditionUs28to44DB': 0,
        'DeductUs28to44DB': 0, 'AdjustedPLFrmSpecuBus': 0},
    'IncSpecifiedBusiness': {
        'NetPLFrmSpecifiedBus': 0, 'AddSec28to44DB': 0,
        'DedSec28to44DBOTDedSec35AD': 0, 'ProfitLossSpecifiedBusiness': 0,
        'ProfitLossSpecifiedBusFinal': 0},
    'IncChrgUnHdProftGain': net,
    'BusSetoffCurrYr': {
        'LossSetOffOnBusLoss': 0, 'TotLossSetOffOnBus': 0, 'LossRemainSetOffOnBus': net},
}

# ── 7. ScheduleOS ─────────────────────────────────────────────────────────────
os5 = i5['ScheduleOS']
os5['IncFromOwnHorse'] = {'Receipts': 0, 'DeductSec57': 0, 'BalanceOwnRaceHorse': 0}
for k in ['IncFrmLottery','IncFrmOnGames','DividendIncUs115BBDA','DividendIncUs115BBDAaiii',
          'DividendIncUs115A1ai','DividendIncUs115AC','DividendIncUs115AD1iDiv',
          'DividendIncUs115AD1IBd','DividendDTAA']:
    os5[k] = copy.deepcopy(DR0)
ded_val = os5['IncOthThanOwnRaceHorse'].get('Deductions', 0)
if not isinstance(ded_val, dict):
    os5['IncOthThanOwnRaceHorse']['Deductions'] = {'Depreciation': 0, 'TotDeductions': ded_val}

# ── 8. ScheduleCG — complete restructure ─────────────────────────────────────
totalCG = i5['ScheduleCG'].get('SumOfCGIncm', 0)

# CurrYrLosses helper objects
def in_stcg(exclude_stcg=None, extra=None):
    d = {k: 0 for k in ['CurrYearIncome','StclSetoff15Per','StclSetoff20Per',
                         'StclSetoff30Per','StclSetoffAppRate','StclSetoffDTAARate','CurrYrCapGain']}
    if exclude_stcg: d.pop(exclude_stcg, None)
    if extra:
        for k in extra: d[k] = 0
    return d

i5['ScheduleCG'] = {
    'ShortTermCapGain': {
        'SlumpSaleInStcg': {'FMV11UAEii': 0, 'FMV11UAEiii': 0, 'FullConsideration': 0,
                            'NetWorthOfDivision': 0, 'CapgainonAssets': 0},
        'NRITransacSec48Dtl': {'NRItaxSTTPaid': 0, 'NRItaxSTTPaidTransferBE': 0,
                               'NRItaxSTTPaidTransferAE': 0, 'NRItaxSTTNotPaid': 0},
        'NRISecur115AD': {
            'FullValueConsdRecvUnqshr': 0, 'FairMrktValueUnqshr': 0,
            'FullValueConsdSec50CA': 0, 'FullValueConsdOthUnqshr': 0,
            'FullConsideration': 0, 'DeductSec48': copy.deepcopy(DED48_0),
            'BalanceCG': 0, 'LossSec94of7Or94of8': 0, 'CapgainonAssets': 0},
        'SaleOnOtherAssets': {
            'FullValueConsdRecvUnqshr': 0, 'FairMrktValueUnqshr': 0,
            'FullValueConsdSec50CA': 0, 'FullValueConsdOthUnqshr': 0,
            'FullConsideration': 0, 'DeductSec48': copy.deepcopy(DED48_0),
            'BalanceCG': 0, 'LossSec94of7Or94of8': 0,
            'DeemedSTCGDeprAsset': 0, 'ExemptionOrDednUs54': {'ExemptionGrandTotal': 0},
            'CapgainonAssets': 0},
        'TotalAmtDeemedStcg': 0, 'PassThrIncNatureSTCG': 0,
        'TotalAmtNotTaxUsDTAAStcg': 0, 'TotalAmtTaxUsDTAAStcg': 0, 'TotalSTCG': 0,
    },
    'LongTermCapGain': {
        'SlumpSaleInLtcgDtls': {},
        'SaleofBondsDebntr': {'FullConsideration': 0, 'DeductSec48': copy.deepcopy(DED48_0), 'BalanceCG': 0},
        'SaleOfEquityShareUs112A': {'CapgainonAssets': 0, 'CapgainonAssetsTransferBE': 0, 'CapgainonAssetsTransferAE': 0},
        'NRISaleOfEquityShareUs112A': {'CapgainonAssets': 0, 'CapgainonAssetsTransferBE': 0, 'CapgainonAssetsTransferAE': 0},
        'SaleofAssetNADtls': {},
        'TotalAmtDeemedLtcg': 0, 'PassThrIncNatureLTCG': 0, 'PassThrIncNatureLTCGUs112A': 0,
        'TotalAmtNotTaxUsDTAALtcg': 0, 'TotalAmtTaxUsDTAALtcg': 0, 'TotalLTCG': 0,
    },
    'SumOfCGIncm': totalCG, 'IncmFromVDATrnsf': 0, 'IncChargeableHeadCapGain': totalCG,
    'DeducClaimInfo': {'TotDeductClaim': 0},
    'CurrYrLosses': {
        'InLossSetOff':  copy.deepcopy(LOSS_TOT_0),
        'InStcg15Per':   {'CurrYearIncome': 0, 'StclSetoff30Per': 0, 'StclSetoffAppRate': 0, 'StclSetoffDTAARate': 0, 'CurrYrCapGain': 0},
        'InStcg20Per':   {'CurrYearIncome': 0, 'StclSetoff15Per': 0, 'StclSetoff30Per': 0, 'StclSetoffAppRate': 0, 'StclSetoffDTAARate': 0, 'CurrYrCapGain': 0},
        'InStcg30Per':   {'CurrYearIncome': 0, 'StclSetoff15Per': 0, 'StclSetoff20Per': 0, 'StclSetoffAppRate': 0, 'StclSetoffDTAARate': 0, 'CurrYrCapGain': 0},
        'InStcgAppRate': {'CurrYearIncome': 0, 'StclSetoff15Per': 0, 'StclSetoff20Per': 0, 'StclSetoff30Per': 0, 'StclSetoffDTAARate': 0, 'CurrYrCapGain': 0},
        'InStcgDTAARate':{'CurrYearIncome': 0, 'StclSetoff15Per': 0, 'StclSetoff20Per': 0, 'StclSetoff30Per': 0, 'StclSetoffAppRate': 0, 'CurrYrCapGain': 0},
        'InLtcg10Per':   {'CurrYearIncome': 0, 'StclSetoff15Per': 0, 'StclSetoff20Per': 0, 'StclSetoff30Per': 0, 'StclSetoffAppRate': 0, 'StclSetoffDTAARate': 0, 'LtclSetOff12_5Per': 0, 'LtclSetOff20Per': 0, 'LtclSetOffDTAARate': 0, 'CurrYrCapGain': 0},
        'InLtcg12_5Per': {'CurrYearIncome': 0, 'StclSetoff15Per': 0, 'StclSetoff20Per': 0, 'StclSetoff30Per': 0, 'StclSetoffAppRate': 0, 'StclSetoffDTAARate': 0, 'LtclSetOff10Per': 0, 'LtclSetOff20Per': 0, 'LtclSetOffDTAARate': 0, 'CurrYrCapGain': 0},
        'InLtcg20Per':   {'CurrYearIncome': 0, 'StclSetoff15Per': 0, 'StclSetoff20Per': 0, 'StclSetoff30Per': 0, 'StclSetoffAppRate': 0, 'StclSetoffDTAARate': 0, 'LtclSetOff10Per': 0, 'LtclSetOff12_5Per': 0, 'LtclSetOffDTAARate': 0, 'CurrYrCapGain': 0},
        'InLtcgDTAARate':{'CurrYearIncome': 0, 'StclSetoff15Per': 0, 'StclSetoff20Per': 0, 'StclSetoff30Per': 0, 'StclSetoffAppRate': 0, 'StclSetoffDTAARate': 0, 'LtclSetOff10Per': 0, 'LtclSetOff12_5Per': 0, 'LtclSetOff20Per': 0, 'CurrYrCapGain': 0},
        'TotLossSetOff':    copy.deepcopy(LOSS_TOT_0),
        'LossRemainSetOff': copy.deepcopy(LOSS_TOT_0),
    },
    'AccruOrRecOfCG': {k: copy.deepcopy(DR_CG) for k in [
        'ShortTermUnder15Per','ShortTermUnder20Per','ShortTermUnder30Per',
        'ShortTermUnderAppRate','ShortTermUnderDTAARate',
        'LongTermUnder10Per','LongTermUnder12_5Per','LongTermUnder20Per','LongTermUnderDTAARate']},
}

# ── 9. Verification — AssesseeVerPAN must be individual PAN ──────────────────
# AssesseeVerPAN is REQUIRED by schema; keep trust PAN for now (user must update
# to authorized signatory's individual PAN via the UI)
# NOTE: This will fail pattern validation until a valid individual PAN is entered.

# ── Validate ─────────────────────────────────────────────────────────────────
import jsonschema
v = jsonschema.Draft4Validator(schema)
errors = sorted(v.iter_errors(itr), key=lambda e: list(e.absolute_path))
print(f'Errors after patch: {len(errors)}')
for e in errors:
    path = ' > '.join(str(x) for x in e.absolute_path)
    print(f'  [{path}] {e.message[:140]}')

if len(errors) == 0 or (len(errors) == 1 and 'AssesseeVerPAN' in str(errors[0].absolute_path)):
    with open(itr_path, 'w', encoding='utf-8') as f:
        json.dump(itr, f, indent=2, ensure_ascii=False)
    print('\nSaved JSON to:', itr_path)
    sys.exit(0)
else:
    sys.exit(1)
