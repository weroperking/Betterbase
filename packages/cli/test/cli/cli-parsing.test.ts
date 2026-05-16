import { describe, expect, it } from "bun:test";
import { CommanderError } from "commander";
import { createProgram } from "../../src/index";

function findCmd(parent: ReturnType<typeof createProgram>, name: string) {
	return parent.commands.find((c) => c.name() === name) as ReturnType<typeof createProgram> | undefined;
}

function findArg(cmd: ReturnType<typeof createProgram>, name: string) {
	return cmd.registeredArguments.find((a) => a.name() === name);
}

function findOpt(cmd: ReturnType<typeof createProgram>, name: string) {
	const longName = name.startsWith("--") ? name : `--${name}`;
	return cmd.options.find((o) => o.name() === name || o.long === longName);
}

describe("CLI argument parsing regression", () => {
	describe("top-level program", () => {
		const program = createProgram();

		it("has name 'bb'", () => {
			expect(program.name()).toBe("bb");
		});

		it("has --debug option", () => {
			const opt = findOpt(program, "debug");
			expect(opt).toBeDefined();
			expect(opt?.long).toBe("--debug");
		});

		it("has --version option", () => {
			const opt = findOpt(program, "version");
			expect(opt).toBeDefined();
			expect(opt?.short).toBe("-v");
			expect(opt?.long).toBe("--version");
		});

		it("uses .exitOverride() for CommanderError instead of process.exit", () => {
			expect(program.exitOverride).toBeDefined();
		});
	});

	describe("init", () => {
		const program = createProgram();
		const init = findCmd(program, "init")!;

		it("registers init command", () => {
			expect(init).toBeDefined();
		});

		it("has optional project-name argument", () => {
			const arg = findArg(init, "project-name");
			expect(arg).toBeDefined();
			expect(arg?.required).toBe(false);
		});

		it("has --no-iac option", () => {
			const opt = findOpt(init, "no-iac");
			expect(opt).toBeDefined();
			expect(opt?.long).toBe("--no-iac");
		});
	});

	describe("auth", () => {
		const program = createProgram();
		const auth = findCmd(program, "auth")!;

		it("registers auth command", () => {
			expect(auth).toBeDefined();
		});

		describe("auth setup", () => {
			const setup = findCmd(auth, "setup")!;

			it("registers setup subcommand", () => {
				expect(setup).toBeDefined();
			});

			it("has optional project-root argument with cwd default", () => {
				const arg = findArg(setup, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
				expect(arg?.defaultValue).toBeDefined();
			});
		});

		describe("auth add-provider", () => {
			const addProvider = findCmd(auth, "add-provider")!;

			it("registers add-provider subcommand", () => {
				expect(addProvider).toBeDefined();
			});

			it("has required provider argument", () => {
				const arg = findArg(addProvider, "provider");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has optional project-root argument", () => {
				const arg = findArg(addProvider, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});
	});

	describe("generate", () => {
		const program = createProgram();
		const generate = findCmd(program, "generate")!;

		it("registers generate command", () => {
			expect(generate).toBeDefined();
		});

		describe("generate crud", () => {
			const crud = findCmd(generate, "crud")!;

			it("registers crud subcommand", () => {
				expect(crud).toBeDefined();
			});

			it("has required table-name argument", () => {
				const arg = findArg(crud, "table-name");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has optional project-root argument", () => {
				const arg = findArg(crud, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});
	});

	describe("graphql", () => {
		const program = createProgram();
		const graphql = findCmd(program, "graphql")!;

		it("registers graphql command", () => {
			expect(graphql).toBeDefined();
		});

		describe("graphql generate", () => {
			const gqlGen = findCmd(graphql, "generate")!;

			it("registers generate subcommand", () => {
				expect(gqlGen).toBeDefined();
			});

			it("has optional project-root argument", () => {
				const arg = findArg(gqlGen, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});

		describe("graphql playground", () => {
			const playground = findCmd(graphql, "playground")!;

			it("registers playground subcommand", () => {
				expect(playground).toBeDefined();
			});
		});
	});

	describe("iac", () => {
		const program = createProgram();
		const iac = findCmd(program, "iac")!;

		it("registers iac command", () => {
			expect(iac).toBeDefined();
		});

		describe("iac sync", () => {
			const sync = findCmd(iac, "sync")!;

			it("registers sync subcommand", () => {
				expect(sync).toBeDefined();
			});

			it("has optional project-root argument", () => {
				const arg = findArg(sync, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});

			it("has --force option", () => {
				const opt = findOpt(sync, "force");
				expect(opt).toBeDefined();
				expect(opt?.long).toBe("--force");
			});
		});

		describe("iac analyze", () => {
			const analyze = findCmd(iac, "analyze")!;

			it("registers analyze subcommand", () => {
				expect(analyze).toBeDefined();
			});

			it("has -o, --output option with default 'table'", () => {
				const opt = findOpt(analyze, "output");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-o");
				expect(opt?.long).toBe("--output");
				expect(opt?.defaultValue).toBe("table");
			});

			it("has optional project-root argument", () => {
				const arg = findArg(analyze, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});

		describe("iac export", () => {
			const exp = findCmd(iac, "export")!;

			it("registers export subcommand", () => {
				expect(exp).toBeDefined();
			});

			it("has -f, --format option with default 'json'", () => {
				const opt = findOpt(exp, "format");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-f");
				expect(opt?.long).toBe("--format");
				expect(opt?.defaultValue).toBe("json");
			});

			it("has -o, --output option with default './backup'", () => {
				const opt = findOpt(exp, "output");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-o");
				expect(opt?.long).toBe("--output");
				expect(opt?.defaultValue).toBe("./backup");
			});

			it("has -t, --table option", () => {
				const opt = findOpt(exp, "table");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-t");
				expect(opt?.long).toBe("--table");
			});

			it("has optional project-root argument", () => {
				const arg = findArg(exp, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});

		describe("iac import", () => {
			const imp = findCmd(iac, "import")!;

			it("registers import subcommand", () => {
				expect(imp).toBeDefined();
			});

			it("has required input argument", () => {
				const arg = findArg(imp, "input");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has -t, --table option", () => {
				const opt = findOpt(imp, "table");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-t");
				expect(opt?.long).toBe("--table");
			});

			it("has -d, --dry-run option", () => {
				const opt = findOpt(imp, "dry-run");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-d");
				expect(opt?.long).toBe("--dry-run");
			});
		});
	});

	describe("migrate", () => {
		const program = createProgram();
		const migrate = findCmd(program, "migrate")!;

		it("registers migrate command", () => {
			expect(migrate).toBeDefined();
		});

		describe("migrate preview", () => {
			const preview = findCmd(migrate, "preview")!;

			it("registers preview subcommand", () => {
				expect(preview).toBeDefined();
			});
		});

		describe("migrate production", () => {
			const production = findCmd(migrate, "production")!;

			it("registers production subcommand", () => {
				expect(production).toBeDefined();
			});
		});

		describe("migrate rollback", () => {
			const rollback = findCmd(migrate, "rollback")!;

			it("registers rollback subcommand", () => {
				expect(rollback).toBeDefined();
			});

			it("has -s, --steps option with default '1'", () => {
				const opt = findOpt(rollback, "steps");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-s");
				expect(opt?.long).toBe("--steps");
				expect(opt?.defaultValue).toBe("1");
			});
		});

		describe("migrate from-convex", () => {
			const fromConvex = findCmd(migrate, "from-convex")!;

			it("registers from-convex subcommand", () => {
				expect(fromConvex).toBeDefined();
			});

			it("has required input-path argument", () => {
				const arg = findArg(fromConvex, "input-path");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has -o, --output option with default './migrated'", () => {
				const opt = findOpt(fromConvex, "output");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-o");
				expect(opt?.long).toBe("--output");
				expect(opt?.defaultValue).toBe("./migrated");
			});
		});
	});

	describe("storage", () => {
		const program = createProgram();
		const storage = findCmd(program, "storage")!;

		it("registers storage command", () => {
			expect(storage).toBeDefined();
		});

		describe("storage init", () => {
			const init = findCmd(storage, "init")!;

			it("registers init subcommand", () => {
				expect(init).toBeDefined();
			});

			it("has optional project-root argument", () => {
				const arg = findArg(init, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});

		describe("storage upload", () => {
			const upload = findCmd(storage, "upload")!;

			it("registers upload subcommand", () => {
				expect(upload).toBeDefined();
			});

			it("has required file argument", () => {
				const arg = findArg(upload, "file");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has -b, --bucket option", () => {
				const opt = findOpt(upload, "bucket");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-b");
				expect(opt?.long).toBe("--bucket");
			});

			it("has -p, --path option", () => {
				const opt = findOpt(upload, "path");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-p");
				expect(opt?.long).toBe("--path");
			});

			it("has -r, --root option with cwd default", () => {
				const opt = findOpt(upload, "root");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-r");
				expect(opt?.long).toBe("--root");
				expect(opt?.defaultValue).toBeDefined();
			});
		});
	});

	describe("rls", () => {
		const program = createProgram();
		const rls = findCmd(program, "rls")!;

		it("registers rls command", () => {
			expect(rls).toBeDefined();
		});

		describe("rls create", () => {
			const create = findCmd(rls, "create")!;

			it("registers create subcommand", () => {
				expect(create).toBeDefined();
			});

			it("has required table argument", () => {
				const arg = findArg(create, "table");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});
		});

		describe("rls disable", () => {
			const disable = findCmd(rls, "disable")!;

			it("registers disable subcommand", () => {
				expect(disable).toBeDefined();
			});

			it("has required table argument", () => {
				const arg = findArg(disable, "table");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});
		});
	});

	describe("webhook", () => {
		const program = createProgram();
		const webhook = findCmd(program, "webhook")!;

		it("registers webhook command", () => {
			expect(webhook).toBeDefined();
		});

		describe("webhook create", () => {
			const create = findCmd(webhook, "create")!;

			it("registers create subcommand", () => {
				expect(create).toBeDefined();
			});

			it("has optional project-root argument", () => {
				const arg = findArg(create, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});

		describe("webhook test", () => {
			const test = findCmd(webhook, "test")!;

			it("registers test subcommand", () => {
				expect(test).toBeDefined();
			});

			it("has required webhook-id argument", () => {
				const arg = findArg(test, "webhook-id");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has optional project-root argument", () => {
				const arg = findArg(test, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});

		describe("webhook logs", () => {
			const logs = findCmd(webhook, "logs")!;

			it("registers logs subcommand", () => {
				expect(logs).toBeDefined();
			});

			it("has required webhook-id argument", () => {
				const arg = findArg(logs, "webhook-id");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has -l, --limit option with default '50'", () => {
				const opt = findOpt(logs, "limit");
				expect(opt).toBeDefined();
				expect(opt?.short).toBe("-l");
				expect(opt?.long).toBe("--limit");
				expect(opt?.defaultValue).toBe("50");
			});
		});
	});

	describe("function", () => {
		const program = createProgram();
		const fn = findCmd(program, "function")!;

		it("registers function command", () => {
			expect(fn).toBeDefined();
		});

		describe("function create", () => {
			const create = findCmd(fn, "create")!;

			it("registers create subcommand", () => {
				expect(create).toBeDefined();
			});

			it("has required name argument", () => {
				const arg = findArg(create, "name");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has optional project-root argument", () => {
				const arg = findArg(create, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});

		describe("function deploy", () => {
			const deploy = findCmd(fn, "deploy")!;

			it("registers deploy subcommand", () => {
				expect(deploy).toBeDefined();
			});

			it("has required name argument", () => {
				const arg = findArg(deploy, "name");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has optional project-root argument", () => {
				const arg = findArg(deploy, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});

			it("has --sync-env option", () => {
				const opt = findOpt(deploy, "sync-env");
				expect(opt).toBeDefined();
				expect(opt?.long).toBe("--sync-env");
			});
		});
	});

	describe("branch", () => {
		const program = createProgram();
		const branch = findCmd(program, "branch")!;

		it("registers branch command", () => {
			expect(branch).toBeDefined();
		});

		describe("branch create", () => {
			const create = findCmd(branch, "create")!;

			it("registers create subcommand", () => {
				expect(create).toBeDefined();
			});

			it("has required name argument", () => {
				const arg = findArg(create, "name");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(true);
			});

			it("has optional project-root argument", () => {
				const arg = findArg(create, "project-root");
				expect(arg).toBeDefined();
				expect(arg?.required).toBe(false);
			});
		});
	});

	describe("login", () => {
		const program = createProgram();
		const login = findCmd(program, "login")!;

		it("registers login command", () => {
			expect(login).toBeDefined();
		});

		it("has --url option with default 'https://api.betterbase.io'", () => {
			const opt = findOpt(login, "url");
			expect(opt).toBeDefined();
			expect(opt?.long).toBe("--url");
			expect(opt?.defaultValue).toBe("https://api.betterbase.io");
		});

		it("has --email option", () => {
			const opt = findOpt(login, "email");
			expect(opt).toBeDefined();
			expect(opt?.long).toBe("--email");
		});
	});

	describe("help text", () => {
		const program = createProgram();

		it("contains expected usage info", () => {
			const help = program.helpInformation();
			expect(help).toContain("bb");
			expect(help).toContain("BetterBase CLI");
		});

		it("lists init command", () => {
			const help = program.helpInformation();
			expect(help).toContain("init");
		});

		it("lists migrate command", () => {
			const help = program.helpInformation();
			expect(help).toContain("migrate");
		});
	});

	describe("parseAsync --help", () => {
		it("throws CommanderError with code commander.helpDisplayed", async () => {
			const program = createProgram();
			try {
				await program.parseAsync(["node", "bb", "--help"]);
				throw new Error("Expected CommanderError to be thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(CommanderError);
				expect((err as CommanderError).code).toBe("commander.helpDisplayed");
			}
		});
	});

	describe("parseAsync --version", () => {
		it("throws CommanderError with code commander.version", async () => {
			const program = createProgram();
			try {
				await program.parseAsync(["node", "bb", "--version"]);
				throw new Error("Expected CommanderError to be thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(CommanderError);
				expect((err as CommanderError).code).toBe("commander.version");
			}
		});
	});

	describe("parseAsync unknown command", () => {
		it("throws CommanderError for unrecognized subcommand", async () => {
			const program = createProgram();
			try {
				await program.parseAsync(["node", "bb", "unknown-command"]);
				throw new Error("Expected CommanderError to be thrown");
			} catch (err) {
				expect(err).toBeInstanceOf(CommanderError);
				expect((err as CommanderError).code).toBe("commander.unknownCommand");
			}
		});
	});
});
