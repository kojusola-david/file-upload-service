import bcrypt from 'bcrypt';
import prisma from './db.js';
import 'dotenv/config';

async function main() {
  const email = process.env.OWNER_EMAIL!;
  const password = process.env.OWNER_PASSWORD!;

  const existing = await prisma.owner.findFirst({ where: { email } });
  if (existing) {
    console.log('Owner already exists');
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.owner.create({ data: { email, password: hashed } });
  console.log('Owner created');
}

main().finally(() => prisma.$disconnect());