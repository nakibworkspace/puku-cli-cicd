import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: Omit<User, "passwordHash">;
  error?: string;
}

const userStore: Map<string, User> = new Map();

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function registerUser(email: string, password: string): Promise<User> {
  const existingUser = Array.from(userStore.values()).find((u) => u.email === email);
  if (existingUser) {
    throw new Error("User already exists");
  }

  const passwordHash = await hashPassword(password);
  const user: User = {
    id: crypto.randomUUID(),
    email,
    passwordHash,
  };

  userStore.set(user.id, user);
  return user;
}

export async function login(credentials: LoginCredentials): Promise<AuthResult> {
  const { email, password } = credentials;

  const user = Array.from(userStore.values()).find((u) => u.email === email);

  if (!user) {
    return { success: false, error: "Invalid email or password" };
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    return { success: false, error: "Invalid email or password" };
  }

  const { passwordHash, ...safeUser } = user;
  return { success: true, user: safeUser };
}
