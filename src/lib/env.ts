export function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável ${name} não definida. Abra o terminal na pasta do projeto, rode "direnv allow" e reinicie o "npm run dev".`,
    );
  }
  return value;
}
