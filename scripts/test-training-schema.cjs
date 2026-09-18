require('dotenv').config({ quiet: true });
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const rollback = new Error('Intentional test rollback');
async function main() {
  let assertions = 0;
  try {
    await prisma.$transaction(async (tx) => {
      const [course] = await tx.$queryRaw`INSERT INTO training_courses(title) VALUES ('Schema rollback test') RETURNING training_course_id`;
      const [lesson] = await tx.$queryRaw`INSERT INTO training_lessons(training_course_id, title) VALUES (${course.training_course_id}::uuid, 'Lesson') RETURNING training_lesson_id`;
      const cases = [
        "INSERT INTO training_materials(training_lesson_id,title,material_type) VALUES ($1::uuid,'Invalid','video')",
        "INSERT INTO training_materials(training_lesson_id,title,material_type,external_url) VALUES ($1::uuid,'Invalid','link','http://example.com')",
        "INSERT INTO training_materials(training_lesson_id,title,material_type,content,display_order) VALUES ($1::uuid,'Invalid','text','Text',0)",
      ];
      for (const sql of cases) {
        await tx.$executeRaw`SAVEPOINT training_test`;
        let failed = false;
        try { await tx.$executeRawUnsafe(sql, lesson.training_lesson_id); } catch { failed = true; }
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT training_test`;
        assert.equal(failed, true);
        assertions++;
      }
      await tx.$executeRaw`INSERT INTO training_materials(training_lesson_id,title,material_type,content) VALUES (${lesson.training_lesson_id}::uuid,'Valid','text','Lesson content')`;
      assertions++;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  const [legacy] = await prisma.$queryRaw`SELECT count(*)::int AS missing FROM quiz_attempts WHERE training_enrollment_id IS NULL`;
  console.log(JSON.stringify({ assertions, legacyAttemptsWithoutEnrollment: legacy.missing, testWritesRolledBack: true }));
}
main().catch(() => { console.error('Training schema verification failed.'); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
