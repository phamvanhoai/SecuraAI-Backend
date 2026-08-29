import type { ModuleManifest } from '@/modules/module.types.js';
import { trainingAwarenessRouter } from './training-awareness.routes.js';

export const trainingAwarenessModule: ModuleManifest = {
  name: 'training-awareness', routePrefix: '/training',
  description: 'Security awareness courses, campaigns, quizzes and certificates',
  tables: ['training_courses', 'training_campaigns', 'training_campaign_targets', 'training_enrollments', 'quizzes', 'quiz_questions', 'quiz_options', 'quiz_attempts', 'quiz_answers', 'training_certificates'],
  capabilities: ['Course/campaign management', 'Enrollment progress', 'Quizzes', 'Certificates'],
  router: trainingAwarenessRouter,
};
