/**
 * electron/main/ipc/returnHandlers.ts
 * Return IPC handlers — CRUD, schedule upserts, status updates
 */

import { ipcMain } from 'electron';
import { getPrisma } from '../database';
import { setupLogger } from '../logger';
import type { TaxRegime, FilingType, ReturnStatus } from '@prisma/client';

const logger = setupLogger('returns');

export function registerReturnHandlers() {

  // ── Create return ───────────────────────────────────────────────────────────
  ipcMain.handle('returns:create', async (_event, data: {
    clientId: number;
    assessmentYearId?: number;
    ayLabel?: string;
    formType: string;
    regime: TaxRegime;
    filingType: FilingType;
  }) => {
    try {
      const prisma = getPrisma();
      const clientId = Number(data.clientId);

      // Resolve or auto-create AssessmentYear
      let assessmentYearId = data.assessmentYearId ? Number(data.assessmentYearId) : 0;

      if (!assessmentYearId) {
        const ayLabel = data.ayLabel ?? (() => {
          const now = new Date();
          const year = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
          return `${year - 1}-${String(year).slice(-2)}`;
        })();

        const existing = await prisma.assessmentYear.findUnique({
          where: { clientId_ayLabel: { clientId, ayLabel } },
        });

        if (existing) {
          assessmentYearId = existing.id;
        } else {
          const newAY = await prisma.assessmentYear.create({
            data: {
              clientId,
              ayLabel,
              regime: data.regime ?? 'NEW',
              filingType: data.filingType ?? 'ORIGINAL',
            },
          });
          assessmentYearId = newAY.id;
        }
      }

      const ret = await prisma.return.create({
        data: {
          clientId,
          assessmentYearId,
          formType: data.formType ?? 'ITR-1',
          status: 'DRAFT',
          regime: data.regime ?? 'NEW',
          filingType: data.filingType ?? 'ORIGINAL',
        },
        include: { assessmentYear: true },
      });

      return { success: true, data: ret };
    } catch (e: any) {
      logger.error('Create return failed: ' + e.message);
      return { success: false, error: e.message };
    }
  });

  // ── Get return ──────────────────────────────────────────────────────────────
  ipcMain.handle('returns:get', async (_event, returnId: number) => {
    try {
      const prisma = getPrisma();
      const ret = await prisma.return.findUnique({
        where: { id: Number(returnId) },
        include: {
          assessmentYear: true,
          client: true,
          salarySchedule: { include: { employers: true } },
          hpSchedule: true,
          osSchedule: true,
          deductionSchedule: true,
          tdsEntries: true,
          taxPayments: true,
          ltcg112AEntries: true,
          presumptiveSchedule: true,
          verification: true,
        },
      });

      if (!ret) return { success: false, error: 'Return not found' };
      return { success: true, data: ret };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── List returns for client ─────────────────────────────────────────────────
  ipcMain.handle('returns:listForClient', async (_event, clientId: number) => {
    try {
      const prisma = getPrisma();
      const returns = await prisma.return.findMany({
        where: { clientId: Number(clientId) },
        include: { assessmentYear: true },
        orderBy: { createdAt: 'desc' },
      });
      return { success: true, data: returns };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Update status ───────────────────────────────────────────────────────────
  ipcMain.handle('returns:updateStatus', async (_event, returnId: number, status: ReturnStatus) => {
    try {
      const prisma = getPrisma();
      await prisma.return.update({
        where: { id: Number(returnId) },
        data: {
          status,
          filedAt: status === 'FILED' ? new Date() : undefined,
        },
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Upsert salary schedule ──────────────────────────────────────────────────
  ipcMain.handle('returns:upsertSalary', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      const rid = Number(returnId);

      const schedule = await prisma.salarySchedule.upsert({
        where: { returnId: rid },
        create: {
          returnId: rid,
          totalGrossSalary: data.TotalGrossSalary ?? 0,
          allwncExtentExemptUs10: data.AllwncExtentExemptUs10 ?? 0,
          netSalary: data.NetSalary ?? 0,
          deductionUs16ia: data.DeductionUs16ia ?? 0,
          entertainmentAlw16ii: data.EntertainmentAlw16ii ?? 0,
          professionalTaxUs16iii: data.ProfessionalTaxUs16iii ?? 0,
          totalDeductionUs16: data.TotalDeductionUs16 ?? 0,
          incomeFromSalary: data.IncomeFromSalary ?? 0,
          hraDetailsJson: data.HRADetails ? JSON.stringify(data.HRADetails) : null,
          allowancesJson: data.AllwncExemptUs10Items ? JSON.stringify(data.AllwncExemptUs10Items) : null,
        },
        update: {
          totalGrossSalary: data.TotalGrossSalary ?? 0,
          allwncExtentExemptUs10: data.AllwncExtentExemptUs10 ?? 0,
          netSalary: data.NetSalary ?? 0,
          deductionUs16ia: data.DeductionUs16ia ?? 0,
          entertainmentAlw16ii: data.EntertainmentAlw16ii ?? 0,
          professionalTaxUs16iii: data.ProfessionalTaxUs16iii ?? 0,
          totalDeductionUs16: data.TotalDeductionUs16 ?? 0,
          incomeFromSalary: data.IncomeFromSalary ?? 0,
          hraDetailsJson: data.HRADetails ? JSON.stringify(data.HRADetails) : null,
          allowancesJson: data.AllwncExemptUs10Items ? JSON.stringify(data.AllwncExemptUs10Items) : null,
        },
      });

      await prisma.employerEntry.deleteMany({ where: { salaryScheduleId: schedule.id } });

      if (data.Employers?.length) {
        for (let i = 0; i < data.Employers.length; i++) {
          const emp = data.Employers[i];
          await prisma.employerEntry.create({
            data: {
              salaryScheduleId: schedule.id,
              seqNo: i + 1,
              nameOfEmployer: emp.NameOfEmployer ?? '',
              natureOfEmployment: emp.NatureOfEmployment ?? 'OTH',
              tanOfEmployer: emp.TANofEmployer,
              addrDetail: emp.AddressDetail?.AddrDetail,
              city: emp.AddressDetail?.CityOrTownOrDistrict,
              stateCode: emp.AddressDetail?.StateCode,
              pinCode: emp.AddressDetail?.PinCode,
              grossSalary: emp.Salarys?.GrossSalary ?? 0,
              salary: emp.Salarys?.Salary ?? 0,
              valueOfPerquisites: emp.Salarys?.ValueOfPerquisites ?? 0,
              profitsinLieuOfSalary: emp.Salarys?.ProfitsinLieuOfSalary ?? 0,
              incomeNotified89A: emp.Salarys?.IncomeNotified89A ?? 0,
              incomeNotifiedOther89A: emp.Salarys?.IncomeNotifiedOther89A ?? 0,
            },
          });
        }
      }

      await prisma.return.update({
        where: { id: rid },
        data: { status: 'IN_PROGRESS' },
      });

      return { success: true };
    } catch (e: any) {
      logger.error('Upsert salary failed: ' + e.message);
      return { success: false, error: e.message };
    }
  });

  // ── Upsert other sources ────────────────────────────────────────────────────
  ipcMain.handle('returns:upsertOtherSources', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      const rid = Number(returnId);

      await prisma.oSSchedule.upsert({
        where: { returnId: rid },
        create: {
          returnId: rid,
          otherSourceItemsJson: JSON.stringify(data.OtherSourceItems ?? []),
          deductionUs57iia: data.DeductionUs57iia ?? 0,
          incomeFromOtherSources: data.IncomeFromOtherSources ?? 0,
          exemptIncomeItemsJson: data.ExemptIncomeItems ? JSON.stringify(data.ExemptIncomeItems) : null,
          totalExemptIncome: data.TotalExemptIncome ?? 0,
        },
        update: {
          otherSourceItemsJson: JSON.stringify(data.OtherSourceItems ?? []),
          deductionUs57iia: data.DeductionUs57iia ?? 0,
          incomeFromOtherSources: data.IncomeFromOtherSources ?? 0,
          exemptIncomeItemsJson: data.ExemptIncomeItems ? JSON.stringify(data.ExemptIncomeItems) : null,
          totalExemptIncome: data.TotalExemptIncome ?? 0,
        },
      });

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Upsert deductions ───────────────────────────────────────────────────────
  ipcMain.handle('returns:upsertDeductions', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      const rid = Number(returnId);

      await prisma.deductionSchedule.upsert({
        where: { returnId: rid },
        create: {
          returnId: rid,
          section80C: data.Section80C ?? 0,
          section80CCC: data.Section80CCC ?? 0,
          section80CCDEmployeeOrSE: data.Section80CCDEmployeeOrSE ?? 0,
          section80CCD1B: data.Section80CCD1B ?? 0,
          section80CCDEmployer: data.Section80CCDEmployer ?? 0,
          section80D: data.Section80D ?? 0,
          section80DD: data.Section80DD ?? 0,
          section80DDB: data.Section80DDB ?? 0,
          section80E: data.Section80E ?? 0,
          section80EE: data.Section80EE ?? 0,
          section80EEA: data.Section80EEA ?? 0,
          section80EEB: data.Section80EEB ?? 0,
          section80G: data.Section80G ?? 0,
          section80GG: data.Section80GG ?? 0,
          section80GGA: data.Section80GGA ?? 0,
          section80GGC: data.Section80GGC ?? 0,
          section80U: data.Section80U ?? 0,
          section80TTA: data.Section80TTA ?? 0,
          section80TTB: data.Section80TTB ?? 0,
          anyOthSec80CCH: data.AnyOthSec80CCH ?? 0,
          totalChapVIAUser: data.TotalChapVIADeductions ?? 0,
          pranNumbersJson: data.PRANNumbers ? JSON.stringify(data.PRANNumbers) : null,
          insuranceDetails80DJson: data.InsuranceDetails ? JSON.stringify(data.InsuranceDetails) : null,
        },
        update: {
          section80C: data.Section80C ?? 0,
          section80CCC: data.Section80CCC ?? 0,
          section80CCDEmployeeOrSE: data.Section80CCDEmployeeOrSE ?? 0,
          section80CCD1B: data.Section80CCD1B ?? 0,
          section80CCDEmployer: data.Section80CCDEmployer ?? 0,
          section80D: data.Section80D ?? 0,
          section80DD: data.Section80DD ?? 0,
          section80DDB: data.Section80DDB ?? 0,
          section80E: data.Section80E ?? 0,
          section80EE: data.Section80EE ?? 0,
          section80EEA: data.Section80EEA ?? 0,
          section80EEB: data.Section80EEB ?? 0,
          section80G: data.Section80G ?? 0,
          section80GG: data.Section80GG ?? 0,
          section80GGA: data.Section80GGA ?? 0,
          section80GGC: data.Section80GGC ?? 0,
          section80U: data.Section80U ?? 0,
          section80TTA: data.Section80TTA ?? 0,
          section80TTB: data.Section80TTB ?? 0,
          anyOthSec80CCH: data.AnyOthSec80CCH ?? 0,
          totalChapVIAUser: data.TotalChapVIADeductions ?? 0,
          pranNumbersJson: data.PRANNumbers ? JSON.stringify(data.PRANNumbers) : null,
          insuranceDetails80DJson: data.InsuranceDetails ? JSON.stringify(data.InsuranceDetails) : null,
        },
      });

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Add TDS entry ───────────────────────────────────────────────────────────
  ipcMain.handle('returns:addTds', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      await prisma.tDSEntry.create({
        data: {
          returnId: Number(returnId),
          entryType: data.entryType ?? 'OTHER',
          tanOfDeductor: data.tanOfDeductor,
          nameOfDeductor: data.nameOfDeductor,
          tdsSection: data.tdsSection,
          amtForTaxDeduct: data.amtForTaxDeduct ?? 0,
          deductedYear: data.deductedYear,
          tdsDeducted: data.tdsDeducted ?? 0,
          tdsClaimed: data.tdsClaimed ?? 0,
          incomeChargeable: data.incomeChargeable,
          grossRentReceived: data.grossRentReceived,
          panOfTenant: data.panOfTenant,
          nameOfTenant: data.nameOfTenant,
        },
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Add tax payment ─────────────────────────────────────────────────────────
  ipcMain.handle('returns:addTaxPayment', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      await prisma.taxPaymentEntry.create({
        data: {
          returnId: Number(returnId),
          paymentType: data.paymentType ?? 'SELF_ASSESSMENT',
          bsrCode: data.bsrCode,
          dateOfDeposit: new Date(data.dateOfDeposit),
          challanSerialNo: data.challanSerialNo,
          taxAmount: data.taxAmount ?? 0,
          surchargeAmount: data.surchargeAmount ?? 0,
          educationCess: data.educationCess ?? 0,
          interestAmount: data.interestAmount ?? 0,
          feeAmount: data.feeAmount ?? 0,
          totalAmount: data.totalAmount ?? 0,
        },
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Get assessment years for client ────────────────────────────────────────
  ipcMain.handle('returns:getAssessmentYears', async (_event, clientId: number) => {
    try {
      const prisma = getPrisma();
      const ays = await prisma.assessmentYear.findMany({
        where: { clientId: Number(clientId) },
        include: { returns: true },
        orderBy: { ayLabel: 'desc' },
      });
      return { success: true, data: ays };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Upsert verification ─────────────────────────────────────────────────────
  ipcMain.handle('returns:upsertVerification', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      const rid = Number(returnId);

      await prisma.returnVerification.upsert({
        where: { returnId: rid },
        create: {
          returnId: rid,
          assesseeVerName: data.AssesseeVerName ?? '',
          fatherName: data.FatherName,
          placeVerSign: data.PlaceVerSign ?? '',
          dateVerSign: new Date(data.DateVerSign),
          capacity: data.Capacity ?? 'S',
          everifyFlag: data.EverifyFlag ?? 'Y',
          aadhaarOTPFlag: data.AadhaarOTPFlag ?? 'N',
          bankAccountFlag: data.BankAccountFlag ?? 'N',
          dematAccountFlag: data.DematAccountFlag ?? 'N',
          trpName: data.TRPName,
          trpIdentification: data.TRPIdentification,
          trpAddress: data.TRPAddress,
        },
        update: {
          assesseeVerName: data.AssesseeVerName ?? '',
          fatherName: data.FatherName,
          placeVerSign: data.PlaceVerSign ?? '',
          dateVerSign: new Date(data.DateVerSign),
          capacity: data.Capacity ?? 'S',
          everifyFlag: data.EverifyFlag ?? 'Y',
          aadhaarOTPFlag: data.AadhaarOTPFlag ?? 'N',
          bankAccountFlag: data.BankAccountFlag ?? 'N',
          dematAccountFlag: data.DematAccountFlag ?? 'N',
          trpName: data.TRPName,
          trpIdentification: data.TRPIdentification,
          trpAddress: data.TRPAddress,
        },
      });

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Upsert house property ───────────────────────────────────────────────────
  ipcMain.handle('returns:upsertHouseProperty', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      const rid = Number(returnId);

      await prisma.hPSchedule.deleteMany({ where: { returnId: rid } });

      if (data.Properties?.length) {
        for (let i = 0; i < data.Properties.length; i++) {
          const p = data.Properties[i];
          await prisma.hPSchedule.create({
            data: {
              returnId: rid,
              seqNo: i + 1,
              addrDetail: p.AddressDetail?.AddrDetail,
              city: p.AddressDetail?.CityOrTownOrDistrict,
              stateCode: p.AddressDetail?.StateCode,
              countryCode: p.AddressDetail?.CountryCode ?? '91',
              pinCode: p.AddressDetail?.PinCode,
              propertyOwner: p.PropertyOwner,
              propCoOwnedFlg: p.PropCoOwnedFlg ?? 'NO',
              asseseeShareProperty: p.AsseseeShareProperty,
              ifLetOut: p.ifLetOut ?? 'S',
              coOwnersJson: p.CoOwners ? JSON.stringify(p.CoOwners) : null,
              tenantDetailsJson: p.TenantDetails ? JSON.stringify(p.TenantDetails) : null,
              annualLetableValue: p.Rentdetails?.AnnualLetableValue,
              rentNotRealized: p.Rentdetails?.RentNotRealized,
              localTaxes: p.Rentdetails?.LocalTaxes,
              totalDeduct: p.Rentdetails?.TotalDeduct,
              incomeOfHP: p.Rentdetails?.IncomeOfHP,
              section24BJson: p.Rentdetails?.Section24B
                ? JSON.stringify(p.Rentdetails.Section24B)
                : null,
              selfOccInterestOnLoan: p.SelfOccInterestOnLoan,
            },
          });
        }
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Upsert TDS schedule ─────────────────────────────────────────────────────
  ipcMain.handle('returns:upsertTDS', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      const rid = Number(returnId);

      await prisma.tDSEntry.deleteMany({ where: { returnId: rid } });

      const allEntries = [
        ...(data.TDSOnSalaries ?? []).map((e: any) => ({ ...e, entryType: 'SALARY' })),
        ...(data.TDSOnOtherIncome ?? []).map((e: any) => ({ ...e, entryType: 'OTHER' })),
        ...(data.TDSOnRent16C ?? []).map((e: any) => ({ ...e, entryType: 'RENT_16C' })),
        ...(data.TCSEntries ?? []).map((e: any) => ({ ...e, entryType: 'TCS' })),
      ];

      for (const entry of allEntries) {
        await prisma.tDSEntry.create({
          data: {
            returnId: rid,
            entryType: entry.entryType,
            tanOfDeductor: entry.EmployerOrDeductorDetails?.TAN,
            nameOfDeductor: entry.EmployerOrDeductorDetails?.EmployerName,
            tdsSection: entry.TDSSection,
            amtForTaxDeduct: entry.AmtForTaxDeduct ?? 0,
            deductedYear: entry.DeductedYear,
            tdsDeducted: entry.TDSDeducted ?? 0,
            tdsClaimed: entry.TDSClaimed ?? 0,
            incomeChargeable: entry.IncomeChargeable,
            grossRentReceived: entry.GrossRentReceived,
            panOfTenant: entry.PANofTenant,
            nameOfTenant: entry.NameOfTenant,
          },
        });
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  // ── Upsert tax payments ─────────────────────────────────────────────────────
  ipcMain.handle('returns:upsertTaxPayments', async (_event, returnId: number, data: any) => {
    try {
      const prisma = getPrisma();
      const rid = Number(returnId);

      await prisma.taxPaymentEntry.deleteMany({ where: { returnId: rid } });

      const allPayments = [
        ...(data.AdvanceTaxPayments ?? []).map((p: any) => ({ ...p, paymentType: 'ADVANCE_TAX' })),
        ...(data.SelfAssessmentPayments ?? []).map((p: any) => ({ ...p, paymentType: 'SELF_ASSESSMENT' })),
      ];

      for (const p of allPayments) {
        await prisma.taxPaymentEntry.create({
          data: {
            returnId: rid,
            paymentType: p.paymentType,
            bsrCode: p.BSRCode,
            dateOfDeposit: new Date(p.DateOfDeposit),
            challanSerialNo: p.ChallanSerialNo,
            taxAmount: p.TaxAmount ?? 0,
            surchargeAmount: p.SurchargeAmount ?? 0,
            educationCess: p.EducationCess ?? 0,
            interestAmount: p.InterestAmount ?? 0,
            feeAmount: p.FeeAmount ?? 0,
            totalAmount: p.TotalAmount ?? 0,
          },
        });
      }

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}
