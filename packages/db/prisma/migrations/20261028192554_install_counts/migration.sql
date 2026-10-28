-- CreateTable
CREATE TABLE "InstallCount" (
    "day" DATE NOT NULL,
    "event" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "way" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InstallCount_pkey" PRIMARY KEY ("day","event","detail","way")
);
