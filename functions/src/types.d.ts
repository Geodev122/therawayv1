declare namespace Express {
  export interface Request {
    user?: {
      uid: string;
      email?: string;
      role?: string;
      name?: string;
    };
  }
}