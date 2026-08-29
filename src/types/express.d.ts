declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; roles: string[]; permissions: string[] };
    }
  }
}

export {};
