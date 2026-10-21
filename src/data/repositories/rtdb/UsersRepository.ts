import { RTBaseRepository } from './RTBaseRepository';

export class UsersRepository extends RTBaseRepository<any> {
  constructor() {
    super('users');
  }
}

export const usersRepository = new UsersRepository();
