/*
  Warnings:

  - You are about to drop the `HousePropertySchedule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `OtherSourcesSchedule` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TaxPayment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TdsEntry` table. If the table is not empty, all the data it contains will be lost.
  - The primary key for the `AppSetting` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `AppSetting` table. All the data in the column will be lost.
  - The primary key for the `AssessmentYear` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `ay` on the `AssessmentYear` table. All the data in the column will be lost.
  - You are about to drop the column `dueDateAudit` on the `AssessmentYear` table. All the data in the column will be lost.
  - You are about to drop the column `dueDateInd` on the `AssessmentYear` table. All the data in the column will be lost.
  - You are about to drop the column `fy` on the `AssessmentYear` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `AssessmentYear` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `AssessmentYear` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `AuditLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `details` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to drop the column `entityType` on the `AuditLog` table. All the data in the column will be lost.
  - You are about to alter the column `entityId` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `id` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `userId` on the `AuditLog` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `BankAccount` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `ifsc` on the `BankAccount` table. All the data in the column will be lost.
  - You are about to drop the column `isJoint` on the `BankAccount` table. All the data in the column will be lost.
  - You are about to alter the column `clientId` on the `BankAccount` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `id` on the `BankAccount` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Client` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `aadhaar` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `addressLine1` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `addressLine2` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `country` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `mobile` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `pincode` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `portalPasswordEnc` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `portalPasswordIV` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `state` on the `Client` table. All the data in the column will be lost.
  - You are about to drop the column `taxRegimeDefault` on the `Client` table. All the data in the column will be lost.
  - You are about to alter the column `firmId` on the `Client` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `id` on the `Client` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `DeductionSchedule` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `sec80C` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80CCC` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80CCD1` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80CCD1B` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80CCD2` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80D` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80DD` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80DDB` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80E` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80EE` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80EEA` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80EEB` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80G` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80GG` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80GGA` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80GGC` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80QQB` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80RRB` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80TTA` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80TTB` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `sec80U` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `totalDeductions` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `totalSec80CCDCap` on the `DeductionSchedule` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `DeductionSchedule` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `returnId` on the `DeductionSchedule` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Document` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `docType` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `fileName` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `filePath` on the `Document` table. All the data in the column will be lost.
  - You are about to drop the column `fileSize` on the `Document` table. All the data in the column will be lost.
  - You are about to alter the column `clientId` on the `Document` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `id` on the `Document` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `returnId` on the `Document` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Firm` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `logoPath` on the `Firm` table. All the data in the column will be lost.
  - You are about to drop the column `pan` on the `Firm` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `Firm` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `PortalActionLog` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `details` on the `PortalActionLog` table. All the data in the column will be lost.
  - You are about to drop the column `errorMsg` on the `PortalActionLog` table. All the data in the column will be lost.
  - You are about to drop the column `performedAt` on the `PortalActionLog` table. All the data in the column will be lost.
  - You are about to alter the column `clientId` on the `PortalActionLog` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `id` on the `PortalActionLog` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `returnId` on the `PortalActionLog` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `Return` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `ackNumber` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `ayId` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `isLocked` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `itrForm` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `itrFormReason` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `itrVStatus` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `lockedAt` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `lockedBy` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `refundOrPayable` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `taxRegime` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `totalTaxLiability` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `totalTaxPaid` on the `Return` table. All the data in the column will be lost.
  - You are about to drop the column `workflowStatus` on the `Return` table. All the data in the column will be lost.
  - You are about to alter the column `clientId` on the `Return` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `grossTotalIncome` on the `Return` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `id` on the `Return` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `taxableIncome` on the `Return` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `totalDeductions` on the `Return` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - The primary key for the `SalarySchedule` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `allowancesTaxable` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `basicSalary` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `employerCategory` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `employerName` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `employerPan` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `employerTan` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `entertainmentAllowance` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `grossSalary` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `hra` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `hraExemption` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `ltaExemption` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `otherExemptions` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `perquisites` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `professionalTax` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `profitInLieuOfSalary` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to drop the column `standardDeduction` on the `SalarySchedule` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `SalarySchedule` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `incomeFromSalary` on the `SalarySchedule` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `netSalary` on the `SalarySchedule` table. The data in that column could be lost. The data in that column will be cast from `Float` to `Int`.
  - You are about to alter the column `returnId` on the `SalarySchedule` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `email` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `User` table. All the data in the column will be lost.
  - You are about to alter the column `firmId` on the `User` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `id` on the `User` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - The primary key for the `ValidationResult` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `code` on the `ValidationResult` table. All the data in the column will be lost.
  - You are about to drop the column `isResolved` on the `ValidationResult` table. All the data in the column will be lost.
  - You are about to drop the column `resolvedAt` on the `ValidationResult` table. All the data in the column will be lost.
  - You are about to drop the column `schedule` on the `ValidationResult` table. All the data in the column will be lost.
  - You are about to alter the column `id` on the `ValidationResult` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - You are about to alter the column `returnId` on the `ValidationResult` table. The data in that column could be lost. The data in that column will be cast from `String` to `Int`.
  - Added the required column `ayLabel` to the `AssessmentYear` table without a default value. This is not possible if the table is not empty.
  - Added the required column `clientId` to the `AssessmentYear` table without a default value. This is not possible if the table is not empty.
  - Added the required column `entity` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firmId` to the `AuditLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ifscCode` to the `BankAccount` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fullName` to the `Client` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originalName` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storedName` to the `Document` table without a default value. This is not possible if the table is not empty.
  - Made the column `clientId` on table `Document` required. This step will fail if there are existing NULL values in that column.
  - Made the column `clientId` on table `PortalActionLog` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `assessmentYearId` to the `Return` table without a default value. This is not possible if the table is not empty.
  - Added the required column `displayName` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `User` table without a default value. This is not possible if the table is not empty.
  - Made the column `field` on table `ValidationResult` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "OtherSourcesSchedule_returnId_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "HousePropertySchedule";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "OtherSourcesSchedule";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TaxPayment";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "TdsEntry";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "EmployerEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "salaryScheduleId" INTEGER NOT NULL,
    "seqNo" INTEGER NOT NULL DEFAULT 1,
    "nameOfEmployer" TEXT NOT NULL,
    "natureOfEmployment" TEXT NOT NULL DEFAULT 'OTH',
    "tanOfEmployer" TEXT,
    "addrDetail" TEXT,
    "city" TEXT,
    "stateCode" TEXT,
    "pinCode" INTEGER,
    "grossSalary" INTEGER NOT NULL DEFAULT 0,
    "salary" INTEGER NOT NULL DEFAULT 0,
    "valueOfPerquisites" INTEGER NOT NULL DEFAULT 0,
    "profitsinLieuOfSalary" INTEGER NOT NULL DEFAULT 0,
    "incomeNotified89A" INTEGER NOT NULL DEFAULT 0,
    "incomeNotifiedOther89A" INTEGER NOT NULL DEFAULT 0,
    "incomeNotifiedPrYr89A" INTEGER NOT NULL DEFAULT 0,
    "natureOfSalaryJson" TEXT,
    "natureOfPerquisitesJson" TEXT,
    "natureOfProfitJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployerEntry_salaryScheduleId_fkey" FOREIGN KEY ("salaryScheduleId") REFERENCES "SalarySchedule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HPSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "seqNo" INTEGER NOT NULL DEFAULT 1,
    "addrDetail" TEXT,
    "city" TEXT,
    "stateCode" TEXT,
    "countryCode" TEXT DEFAULT '91',
    "pinCode" INTEGER,
    "propertyOwner" TEXT,
    "propertyOwnerOther" TEXT,
    "propCoOwnedFlg" TEXT NOT NULL DEFAULT 'NO',
    "asseseeShareProperty" REAL,
    "ifLetOut" TEXT NOT NULL DEFAULT 'S',
    "coOwnersJson" TEXT,
    "tenantDetailsJson" TEXT,
    "annualLetableValue" INTEGER,
    "rentNotRealized" INTEGER,
    "localTaxes" INTEGER,
    "totalUnrealizedAndTax" INTEGER,
    "balanceALV" INTEGER,
    "annualOfPropOwned" INTEGER,
    "thirtyPercentBalance" INTEGER,
    "intOnBorwCap" INTEGER,
    "totalDeduct" INTEGER,
    "arrearsUnrealRentRcvd" INTEGER,
    "incomeOfHP" INTEGER,
    "section24BJson" TEXT,
    "totalInterestUs24B" INTEGER,
    "selfOccInterestOnLoan" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HPSchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OSSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "otherSourceItemsJson" TEXT,
    "deductionUs57iia" INTEGER NOT NULL DEFAULT 0,
    "incomeFromOtherSources" INTEGER NOT NULL DEFAULT 0,
    "exemptIncomeItemsJson" TEXT,
    "totalExemptIncome" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OSSchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TDSEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "entryType" TEXT NOT NULL,
    "tanOfDeductor" TEXT,
    "nameOfDeductor" TEXT,
    "deductorAddress" TEXT,
    "incomeChargeable" INTEGER,
    "tdsSection" TEXT,
    "amtForTaxDeduct" INTEGER,
    "deductedYear" TEXT,
    "grossRentReceived" INTEGER,
    "panOfTenant" TEXT,
    "aadhaarOfTenant" TEXT,
    "nameOfTenant" TEXT,
    "tcsSection" TEXT,
    "amtOnWhichTCS" INTEGER,
    "tdsDeducted" INTEGER NOT NULL DEFAULT 0,
    "tdsClaimed" INTEGER NOT NULL DEFAULT 0,
    "tcsCollected" INTEGER,
    "tcsClaimed" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TDSEntry_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxPaymentEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "paymentType" TEXT NOT NULL,
    "bsrCode" TEXT NOT NULL,
    "dateOfDeposit" DATETIME NOT NULL,
    "challanSerialNo" TEXT NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "surchargeAmount" INTEGER NOT NULL DEFAULT 0,
    "educationCess" INTEGER NOT NULL DEFAULT 0,
    "interestAmount" INTEGER NOT NULL DEFAULT 0,
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "stateCode" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxPaymentEntry_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LTCG112AEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "isin" TEXT NOT NULL,
    "shareOrUnitName" TEXT NOT NULL,
    "fmvAsOn31Jan2018" INTEGER,
    "salesValue" INTEGER NOT NULL DEFAULT 0,
    "purchaseCost" INTEGER NOT NULL DEFAULT 0,
    "expenditure" INTEGER NOT NULL DEFAULT 0,
    "gainLoss" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LTCG112AEntry_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PresumptiveSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "totalIncome44AD" INTEGER NOT NULL DEFAULT 0,
    "totalIncome44ADA" INTEGER NOT NULL DEFAULT 0,
    "totalIncome44AE" INTEGER NOT NULL DEFAULT 0,
    "totalPresumptive" INTEGER NOT NULL DEFAULT 0,
    "business44ADJson" TEXT,
    "profession44ADAJson" TEXT,
    "goodsCarriage44AEJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PresumptiveSchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReturnVerification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "assesseeVerName" TEXT NOT NULL,
    "fatherName" TEXT,
    "placeVerSign" TEXT NOT NULL,
    "dateVerSign" DATETIME NOT NULL,
    "capacity" TEXT NOT NULL DEFAULT 'S',
    "everifyFlag" TEXT DEFAULT 'Y',
    "aadhaarOTPFlag" TEXT DEFAULT 'N',
    "bankAccountFlag" TEXT DEFAULT 'N',
    "dematAccountFlag" TEXT DEFAULT 'N',
    "trpName" TEXT,
    "trpIdentification" TEXT,
    "trpAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReturnVerification_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AppSetting" ("key", "updatedAt", "value") SELECT "key", "updatedAt", "value" FROM "AppSetting";
DROP TABLE "AppSetting";
ALTER TABLE "new_AppSetting" RENAME TO "AppSetting";
CREATE TABLE "new_AssessmentYear" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "ayLabel" TEXT NOT NULL,
    "regime" TEXT NOT NULL DEFAULT 'NEW',
    "filingType" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssessmentYear_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AssessmentYear" ("createdAt", "id") SELECT "createdAt", "id" FROM "AssessmentYear";
DROP TABLE "AssessmentYear";
ALTER TABLE "new_AssessmentYear" RENAME TO "AssessmentYear";
CREATE UNIQUE INDEX "AssessmentYear_clientId_ayLabel_key" ON "AssessmentYear"("clientId", "ayLabel");
CREATE TABLE "new_AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firmId" INTEGER NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER,
    "description" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AuditLog" ("action", "createdAt", "entityId", "id", "ipAddress", "userId") SELECT "action", "createdAt", "entityId", "id", "ipAddress", "userId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE TABLE "new_BankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "accountType" TEXT NOT NULL DEFAULT 'SAVINGS',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BankAccount" ("accountNumber", "accountType", "bankName", "clientId", "createdAt", "id", "isPrimary") SELECT "accountNumber", "accountType", "bankName", "clientId", "createdAt", "id", "isPrimary" FROM "BankAccount";
DROP TABLE "BankAccount";
ALTER TABLE "new_BankAccount" RENAME TO "BankAccount";
CREATE TABLE "new_Client" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firmId" INTEGER NOT NULL,
    "pan" TEXT NOT NULL,
    "assesseeType" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" DATETIME,
    "mobileNumber" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "stateCode" TEXT,
    "pinCode" INTEGER,
    "aadhaarNumber" TEXT,
    "residentialStatus" TEXT DEFAULT 'RES',
    "portalUsername" TEXT,
    "portalPasswordEncrypted" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("assesseeType", "city", "createdAt", "dateOfBirth", "email", "firmId", "id", "isActive", "pan", "portalUsername", "residentialStatus", "updatedAt") SELECT "assesseeType", "city", "createdAt", "dateOfBirth", "email", "firmId", "id", "isActive", "pan", "portalUsername", "residentialStatus", "updatedAt" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_pan_key" ON "Client"("pan");
CREATE TABLE "new_DeductionSchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "section80C" INTEGER NOT NULL DEFAULT 0,
    "section80CCC" INTEGER NOT NULL DEFAULT 0,
    "section80CCDEmployeeOrSE" INTEGER NOT NULL DEFAULT 0,
    "section80CCD1B" INTEGER NOT NULL DEFAULT 0,
    "section80CCDEmployer" INTEGER NOT NULL DEFAULT 0,
    "pranNumbersJson" TEXT,
    "pensionContrib80CCCJson" TEXT,
    "section80D" INTEGER NOT NULL DEFAULT 0,
    "insuranceDetails80DJson" TEXT,
    "section80DD" INTEGER NOT NULL DEFAULT 0,
    "disabilityType80DD" TEXT,
    "disabilityNature80DD" TEXT,
    "section80DDB" INTEGER NOT NULL DEFAULT 0,
    "claimant80DDB" TEXT,
    "specialDisease80DDB" TEXT,
    "section80U" INTEGER NOT NULL DEFAULT 0,
    "disabilityType80U" TEXT,
    "disabilityNature80U" TEXT,
    "section80E" INTEGER NOT NULL DEFAULT 0,
    "section80EE" INTEGER NOT NULL DEFAULT 0,
    "section80EEA" INTEGER NOT NULL DEFAULT 0,
    "section80EEB" INTEGER NOT NULL DEFAULT 0,
    "section80G" INTEGER NOT NULL DEFAULT 0,
    "section80GGA" INTEGER NOT NULL DEFAULT 0,
    "section80GGC" INTEGER NOT NULL DEFAULT 0,
    "form10BAAckNum" TEXT,
    "section80GG" INTEGER NOT NULL DEFAULT 0,
    "section80TTA" INTEGER NOT NULL DEFAULT 0,
    "section80TTB" INTEGER NOT NULL DEFAULT 0,
    "anyOthSec80CCH" INTEGER NOT NULL DEFAULT 0,
    "totalChapVIAUser" INTEGER NOT NULL DEFAULT 0,
    "totalChapVIAAllowed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeductionSchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DeductionSchedule" ("createdAt", "id", "returnId", "updatedAt") SELECT "createdAt", "id", "returnId", "updatedAt" FROM "DeductionSchedule";
DROP TABLE "DeductionSchedule";
ALTER TABLE "new_DeductionSchedule" RENAME TO "DeductionSchedule";
CREATE UNIQUE INDEX "DeductionSchedule_returnId_key" ON "DeductionSchedule"("returnId");
CREATE TABLE "new_Document" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "returnId" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "notes" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Document_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("clientId", "id", "mimeType", "notes", "returnId", "uploadedAt") SELECT "clientId", "id", "mimeType", "notes", "returnId", "uploadedAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE TABLE "new_Firm" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "gstin" TEXT,
    "swCreatedBy" TEXT,
    "swVersionNo" TEXT DEFAULT '1.0',
    "intermediaryCity" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Firm" ("address", "createdAt", "email", "gstin", "id", "name", "phone", "updatedAt") SELECT "address", "createdAt", "email", "gstin", "id", "name", "phone", "updatedAt" FROM "Firm";
DROP TABLE "Firm";
ALTER TABLE "new_Firm" RENAME TO "Firm";
CREATE TABLE "new_PortalActionLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "returnId" INTEGER,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalActionLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PortalActionLog_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PortalActionLog" ("action", "clientId", "id", "returnId", "status") SELECT "action", "clientId", "id", "returnId", "status" FROM "PortalActionLog";
DROP TABLE "PortalActionLog";
ALTER TABLE "new_PortalActionLog" RENAME TO "PortalActionLog";
CREATE TABLE "new_Return" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clientId" INTEGER NOT NULL,
    "assessmentYearId" INTEGER NOT NULL,
    "formType" TEXT NOT NULL DEFAULT 'ITR-1',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "filingType" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "filingSection" TEXT DEFAULT '11',
    "regime" TEXT NOT NULL DEFAULT 'NEW',
    "filedAt" DATETIME,
    "acknowledgementNumber" TEXT,
    "itrJson" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "grossTotalIncome" INTEGER DEFAULT 0,
    "totalDeductions" INTEGER DEFAULT 0,
    "taxableIncome" INTEGER DEFAULT 0,
    "grossTaxLiability" INTEGER DEFAULT 0,
    "totalTaxesPaid" INTEGER DEFAULT 0,
    "balTaxPayable" INTEGER DEFAULT 0,
    "refundDue" INTEGER DEFAULT 0,
    CONSTRAINT "Return_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Return_assessmentYearId_fkey" FOREIGN KEY ("assessmentYearId") REFERENCES "AssessmentYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Return" ("clientId", "createdAt", "filedAt", "grossTotalIncome", "id", "taxableIncome", "totalDeductions", "updatedAt") SELECT "clientId", "createdAt", "filedAt", "grossTotalIncome", "id", "taxableIncome", "totalDeductions", "updatedAt" FROM "Return";
DROP TABLE "Return";
ALTER TABLE "new_Return" RENAME TO "Return";
CREATE TABLE "new_SalarySchedule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "totalGrossSalary" INTEGER NOT NULL DEFAULT 0,
    "allwncExtentExemptUs10" INTEGER NOT NULL DEFAULT 0,
    "netSalary" INTEGER NOT NULL DEFAULT 0,
    "deductionUs16ia" INTEGER NOT NULL DEFAULT 0,
    "entertainmentAlw16ii" INTEGER NOT NULL DEFAULT 0,
    "professionalTaxUs16iii" INTEGER NOT NULL DEFAULT 0,
    "totalDeductionUs16" INTEGER NOT NULL DEFAULT 0,
    "incomeFromSalary" INTEGER NOT NULL DEFAULT 0,
    "increliefus89A" INTEGER NOT NULL DEFAULT 0,
    "hraDetailsJson" TEXT,
    "allowancesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalarySchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SalarySchedule" ("createdAt", "id", "incomeFromSalary", "netSalary", "returnId", "updatedAt") SELECT "createdAt", "id", "incomeFromSalary", "netSalary", "returnId", "updatedAt" FROM "SalarySchedule";
DROP TABLE "SalarySchedule";
ALTER TABLE "new_SalarySchedule" RENAME TO "SalarySchedule";
CREATE UNIQUE INDEX "SalarySchedule_returnId_key" ON "SalarySchedule"("returnId");
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "firmId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_User" ("createdAt", "firmId", "id", "isActive", "lastLoginAt", "passwordHash", "role", "updatedAt") SELECT "createdAt", "firmId", "id", "isActive", "lastLoginAt", "passwordHash", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE TABLE "new_ValidationResult" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "returnId" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationResult_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ValidationResult" ("createdAt", "field", "id", "message", "returnId", "severity") SELECT "createdAt", "field", "id", "message", "returnId", "severity" FROM "ValidationResult";
DROP TABLE "ValidationResult";
ALTER TABLE "new_ValidationResult" RENAME TO "ValidationResult";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "EmployerEntry_salaryScheduleId_seqNo_key" ON "EmployerEntry"("salaryScheduleId", "seqNo");

-- CreateIndex
CREATE UNIQUE INDEX "HPSchedule_returnId_seqNo_key" ON "HPSchedule"("returnId", "seqNo");

-- CreateIndex
CREATE UNIQUE INDEX "OSSchedule_returnId_key" ON "OSSchedule"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "PresumptiveSchedule_returnId_key" ON "PresumptiveSchedule"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnVerification_returnId_key" ON "ReturnVerification"("returnId");
