-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "pan" TEXT,
    "gstin" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logoPath" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firmId" TEXT NOT NULL,
    "pan" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assesseeType" TEXT NOT NULL,
    "dateOfBirth" DATETIME,
    "aadhaar" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "residentialStatus" TEXT NOT NULL DEFAULT 'RESIDENT',
    "taxRegimeDefault" TEXT NOT NULL DEFAULT 'NEW',
    "portalUsername" TEXT,
    "portalPasswordEnc" TEXT,
    "portalPasswordIV" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Client_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isJoint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssessmentYear" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ay" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "dueDateInd" DATETIME,
    "dueDateAudit" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Return" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "ayId" TEXT NOT NULL,
    "itrForm" TEXT,
    "itrFormReason" TEXT,
    "workflowStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "taxRegime" TEXT NOT NULL DEFAULT 'NEW',
    "filedAt" DATETIME,
    "ackNumber" TEXT,
    "itrVStatus" TEXT,
    "grossTotalIncome" REAL,
    "totalDeductions" REAL,
    "taxableIncome" REAL,
    "totalTaxLiability" REAL,
    "totalTaxPaid" REAL,
    "refundOrPayable" REAL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Return_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Return_ayId_fkey" FOREIGN KEY ("ayId") REFERENCES "AssessmentYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalarySchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "basicSalary" REAL NOT NULL DEFAULT 0,
    "hra" REAL NOT NULL DEFAULT 0,
    "allowancesTaxable" REAL NOT NULL DEFAULT 0,
    "perquisites" REAL NOT NULL DEFAULT 0,
    "profitInLieuOfSalary" REAL NOT NULL DEFAULT 0,
    "grossSalary" REAL NOT NULL DEFAULT 0,
    "hraExemption" REAL NOT NULL DEFAULT 0,
    "ltaExemption" REAL NOT NULL DEFAULT 0,
    "otherExemptions" REAL NOT NULL DEFAULT 0,
    "netSalary" REAL NOT NULL DEFAULT 0,
    "standardDeduction" REAL NOT NULL DEFAULT 0,
    "entertainmentAllowance" REAL NOT NULL DEFAULT 0,
    "professionalTax" REAL NOT NULL DEFAULT 0,
    "incomeFromSalary" REAL NOT NULL DEFAULT 0,
    "employerName" TEXT,
    "employerTan" TEXT,
    "employerPan" TEXT,
    "employerCategory" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SalarySchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HousePropertySchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "propertyIndex" INTEGER NOT NULL DEFAULT 1,
    "propertyType" TEXT NOT NULL,
    "addressLine1" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "coOwnershipPct" REAL NOT NULL DEFAULT 100,
    "annualValue" REAL NOT NULL DEFAULT 0,
    "municipalTaxPaid" REAL NOT NULL DEFAULT 0,
    "netAnnualValue" REAL NOT NULL DEFAULT 0,
    "standardDeduction30" REAL NOT NULL DEFAULT 0,
    "interestOnLoan" REAL NOT NULL DEFAULT 0,
    "interestSopCurrent" REAL NOT NULL DEFAULT 0,
    "interestSopPrior" REAL NOT NULL DEFAULT 0,
    "incomeFromHP" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HousePropertySchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OtherSourcesSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "interestSavings" REAL NOT NULL DEFAULT 0,
    "interestFD" REAL NOT NULL DEFAULT 0,
    "interestRD" REAL NOT NULL DEFAULT 0,
    "interestOther" REAL NOT NULL DEFAULT 0,
    "dividendIncome" REAL NOT NULL DEFAULT 0,
    "winningsLottery" REAL NOT NULL DEFAULT 0,
    "winningsHorseRace" REAL NOT NULL DEFAULT 0,
    "familyPension" REAL NOT NULL DEFAULT 0,
    "agriculturalIncome" REAL NOT NULL DEFAULT 0,
    "anyOtherIncome" REAL NOT NULL DEFAULT 0,
    "anyOtherIncomeDesc" TEXT,
    "deductionFamilyPension" REAL NOT NULL DEFAULT 0,
    "incomeFromOS" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OtherSourcesSchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeductionSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "sec80C" REAL NOT NULL DEFAULT 0,
    "sec80CCC" REAL NOT NULL DEFAULT 0,
    "sec80CCD1" REAL NOT NULL DEFAULT 0,
    "sec80CCD1B" REAL NOT NULL DEFAULT 0,
    "sec80CCD2" REAL NOT NULL DEFAULT 0,
    "totalSec80CCDCap" REAL NOT NULL DEFAULT 0,
    "sec80D" REAL NOT NULL DEFAULT 0,
    "sec80DD" REAL NOT NULL DEFAULT 0,
    "sec80DDB" REAL NOT NULL DEFAULT 0,
    "sec80EE" REAL NOT NULL DEFAULT 0,
    "sec80EEA" REAL NOT NULL DEFAULT 0,
    "sec80EEB" REAL NOT NULL DEFAULT 0,
    "sec80E" REAL NOT NULL DEFAULT 0,
    "sec80G" REAL NOT NULL DEFAULT 0,
    "sec80GG" REAL NOT NULL DEFAULT 0,
    "sec80GGA" REAL NOT NULL DEFAULT 0,
    "sec80GGC" REAL NOT NULL DEFAULT 0,
    "sec80TTA" REAL NOT NULL DEFAULT 0,
    "sec80TTB" REAL NOT NULL DEFAULT 0,
    "sec80U" REAL NOT NULL DEFAULT 0,
    "sec80RRB" REAL NOT NULL DEFAULT 0,
    "sec80QQB" REAL NOT NULL DEFAULT 0,
    "totalDeductions" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeductionSchedule_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "bsrCode" TEXT,
    "challanNo" TEXT,
    "dateOfPayment" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "bankName" TEXT,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxPayment_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TdsEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "deductorName" TEXT NOT NULL,
    "deductorTan" TEXT,
    "deductorPan" TEXT,
    "section" TEXT,
    "grossReceipt" REAL NOT NULL DEFAULT 0,
    "tdsAmount" REAL NOT NULL DEFAULT 0,
    "tcsAmount" REAL NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "as26Amount" REAL,
    "reconStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TdsEntry_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "returnId" TEXT,
    "docType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "notes" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ValidationResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "field" TEXT,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ValidationResult_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalActionLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "returnId" TEXT,
    "clientId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" TEXT,
    "errorMsg" TEXT,
    "performedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalActionLog_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "Return" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_pan_key" ON "Client"("pan");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentYear_ay_key" ON "AssessmentYear"("ay");

-- CreateIndex
CREATE UNIQUE INDEX "Return_clientId_ayId_key" ON "Return"("clientId", "ayId");

-- CreateIndex
CREATE UNIQUE INDEX "SalarySchedule_returnId_key" ON "SalarySchedule"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "OtherSourcesSchedule_returnId_key" ON "OtherSourcesSchedule"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "DeductionSchedule_returnId_key" ON "DeductionSchedule"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_key_key" ON "AppSetting"("key");
