// Minimal argument parsing and error reporting shared by scripts/*.ts.
//   --name=value   (repeatable: all values are kept)
//   --flag         (boolean)
//   positional     (anything not starting with --)

export type Args = {
  positional: string[];
  /** Last value of --name=value, or undefined. */
  get(name: string): string | undefined;
  /** Every value of a repeatable --name=value, also split on commas when split=true. */
  all(name: string, split?: boolean): string[];
  has(name: string): boolean;
};

export function parseArgs(argv = process.argv.slice(2)): Args {
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  const positional: string[] = [];
  for (const a of argv) {
    if (!a.startsWith("--")) {
      positional.push(a);
      continue;
    }
    const eq = a.indexOf("=");
    if (eq === -1) {
      flags.add(a.slice(2));
    } else {
      const name = a.slice(2, eq);
      values.set(name, [...(values.get(name) ?? []), a.slice(eq + 1)]);
    }
  }
  return {
    positional,
    get: (name) => values.get(name)?.at(-1),
    all: (name, split = false) =>
      (values.get(name) ?? []).flatMap((v) => (split ? v.split(",") : [v])).map((v) => v.trim()).filter(Boolean),
    has: (name) => flags.has(name) || values.has(name),
  };
}

/** A problem the user can fix: printed without a stack trace. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function requireOpt(args: Args, name: string, hint = ""): string {
  const v = args.get(name);
  if (!v) throw new UserError(`--${name}=… を指定してください。${hint}`);
  return v;
}

/** Runs a script body; prints UserError messages plainly and exits 1. */
export async function runCli(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (err) {
    if (err instanceof UserError) {
      console.error(`エラー: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  }
}

export const fmtTime = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};
