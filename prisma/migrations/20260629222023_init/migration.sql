/*
  Warnings:

  - Changed the type of `mimetype` on the `Image` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Image" DROP COLUMN "mimetype",
ADD COLUMN     "mimetype" INTEGER NOT NULL;
