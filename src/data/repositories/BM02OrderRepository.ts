import { BaseRepository } from './BaseRepository';

// Add type definition later when migrating models
export interface BM02Order {
  id: string;
  [key: string]: any;
}

export class BM02OrderRepository extends BaseRepository<BM02Order> {
  constructor() {
    super('bm02Orders');
  }
}

export const bm02OrderRepository = new BM02OrderRepository();
