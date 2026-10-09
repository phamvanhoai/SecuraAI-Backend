import { Prisma } from '@prisma/client';
import { AppError } from '../../common/errors/app-error.js';
import { controlEffectivenessRepository } from './control-effectiveness.repository.js';
import { controlCatalogRepository, type CatalogControl } from './control-catalog.repository.js';
import type { CreateControlInput, EditControlInput } from './dto/manage-control.dto.js';
function map(control: CatalogControl & { revision: string }) {
  const owner = control.users_security_controls_owner_user_idTousers;
  return {
    id: control.id,
    controlCode: control.control_code,
    name: control.name,
    description: control.description,
    applicability: control.applicability.toLowerCase(),
    implementationStatus: control.implementation_status.toLowerCase(),
    owner: owner
      ? { id: owner.id, fullName: owner.full_name, status: owner.status.toLowerCase() }
      : null,
    createdAt: control.created_at,
    updatedAt: control.updated_at,
    configurationLocked: control._count.control_assessments > 0,
    revision: control.revision,
  };
}
async function officer(actorId: string) {
  const actor = await controlEffectivenessRepository.findActor(actorId);
  if (!actor || actor.status !== 'ACTIVE')
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  if (actor.role !== 'SECURITY_OFFICER')
    throw new AppError(403, 'FORBIDDEN', 'Security Officer required');
}
export const controlCatalogService = {
  async get(actorId: string, controlId: string) {
    await officer(actorId);
    const control = await controlCatalogRepository.find(controlId);
    if (!control) throw new AppError(404, 'CONTROL_NOT_FOUND', 'Security control not found');
    return map(control);
  },
  async owners(actorId: string, q: string) {
    await officer(actorId);
    return {
      items: (await controlCatalogRepository.owners(q)).map((value) => ({
        id: value.id,
        fullName: value.full_name,
      })),
    };
  },
  async create(actorId: string, input: CreateControlInput) {
    await officer(actorId);
    try {
      return map(await controlCatalogRepository.create(actorId, input));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new AppError(409, 'CONTROL_CODE_EXISTS', 'Control code is already in use');
      throw error;
    }
  },
  async edit(actorId: string, controlId: string, input: EditControlInput) {
    await officer(actorId);
    return map(await controlCatalogRepository.edit(actorId, controlId, input));
  },
};
