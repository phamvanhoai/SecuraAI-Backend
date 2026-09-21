import type { ModuleManifest } from '../module.types.js';
import { trainingAwarenessRouter } from './training-awareness.routes.js';

export const trainingAwarenessModule: ModuleManifest = {
  name: 'training-awareness',
  routePrefix: '/training',
  description: 'Security awareness courses, campaigns, quizzes and certificates',
  tables: [
    'training_courses',
    'training_lessons',
    'training_materials',
    'training_lesson_progress',
    'training_campaigns',
    'training_campaign_targets',
    'training_enrollments',
    'quizzes',
    'quiz_questions',
    'quiz_options',
    'quiz_attempts',
    'quiz_answers',
    'training_certificates',
  ],
  capabilities: [
    'View all issued training certificates (UC164)',
    'View certificates issued to the signed-in employee (UC165)',
    'Issue and view training completion certificates for completed, passed enrollments',
    'Create and list security awareness course drafts',
    'Edit unassigned security awareness course drafts (UC160)',
    'Assign courses to users and departments',
    'Take and automatically score post-training assessments',
    'Track campaign and employee training completion',
    'View department training completion reports (UC81)',
    'Automatically send in-app training deadline reminders',
  ],
  router: trainingAwarenessRouter,
};
