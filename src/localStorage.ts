import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const EMAIL_STORE_PATH = path.join(os.homedir(), '.smockit_registered_email');

export function saveEmailLocally(email: string): void {
  fs.writeFileSync(EMAIL_STORE_PATH, email.trim(), { encoding: 'utf-8' });
}

export function loadEmailLocally(): string | undefined {
  if (fs.existsSync(EMAIL_STORE_PATH)) {
    const email = fs.readFileSync(EMAIL_STORE_PATH, { encoding: 'utf-8' }).trim();
    // eslint-disable-next-line no-useless-escape
    if (email && /^[\w\.-]+@[\w\.-]+\.\w+$/.test(email)) return email;
  }
  return undefined;
}