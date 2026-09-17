import type { ModuleManifest } from '../module.types.js';
import { trainingAwarenessRouter } from './training-awareness.routes.js';

export const trainingAwarenessModule: ModuleManifest = {
  name: 'training-awareness',
  routePrefix: '/training',
  description: 'Security awareness courses, campaigns, quizzes and certificates',
  tables: [
    'training_courses',
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
    'Create and list security awareness course drafts',
    'Assign courses to users and departments',
    'Take and automatically score post-training assessments',
    'Track campaign and employee training completion',
    'Automatically send in-app training deadline reminders',
  ],
  router: trainingAwarenessRouter,
};
