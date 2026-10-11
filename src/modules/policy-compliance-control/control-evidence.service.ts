import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { controlEvidenceRepository } from './control-evidence.repository.js';
import type {
  AddControlEvidence,
  LinkControlEvidence,
  ListControlEvidence,
} from './dto/control-evidence.dto.js';
async function safely<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2034', 'P2002'].includes(error.code)
    )
      throw new AppError(
        409,
        'EVIDENCE_CONFLICT',
        'Evidence changed concurrently. Refresh and check whether it was already saved before retrying',
      );
    throw error;
  }
}
export const controlEvidenceService = {
  list(actorId: string, controlId: string, input: ListControlEvidence) {
    return safely(() => controlEvidenceRepository.list(actorId, controlId, input));
  },
  add(actorId: string, controlId: string, input: AddControlEvidence) {
    return safely(() => controlEvidenceRepository.add(actorId, controlId, input));
  },
  link(actorId: string, controlId: string, input: LinkControlEvidence) {
    return safely(() => controlEvidenceRepository.link(actorId, controlId, input));
  },
};
