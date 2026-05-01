import { afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

// Force chalk to emit ANSI colors in test environment
process.env.FORCE_COLOR = "1";

// Dynamically import logger after forcing color support
let logger!: typeof import("../src/utils/logger");

beforeAll(async () => {
	logger = await import("../src/utils/logger");
});

function stripAnsi(str: string): string {
	return str.replace(/\x1b\[[0-9;]*m/g, "");
}

let spyLog: ReturnType<typeof mock>;
let spyError: ReturnType<typeof mock>;
let spyWarn: ReturnType<typeof mock>;
const origLog = console.log;
const origError = console.error;
const origWarn = console.warn;

beforeEach(() => {
	spyLog = mock((..._args: unknown[]) => {});
	spyError = mock((..._args: unknown[]) => {});
	spyWarn = mock((..._args: unknown[]) => {});
	console.log = spyLog as unknown as typeof console.log;
	console.error = spyError as unknown as typeof console.error;
	console.warn = spyWarn as unknown as typeof console.warn;
});

afterEach(() => {
	console.log = origLog;
	console.error = origError;
	console.warn = origWarn;
});

describe("Logger utility", () => {
	describe("info method", () => {
		it("logs informational messages to console.log", () => {
			logger.info("Test info message");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain("Test info message");
			expect(output).toContain(logger.sym.info);
		});

		it("handles empty string message", () => {
			logger.info("");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain(logger.sym.info);
		});

		it("handles special characters in message", () => {
			logger.info("Special chars: @#$%^&*()");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain("Special chars: @#$%^&*()");
		});

		it("calls console.log with cyan ◆ prefix", () => {
			logger.info("info test");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const raw = spyLog.mock.calls[0][0] as string;
			const stripped = stripAnsi(raw);
			expect(stripped).toContain("◆ info test");
			expect(raw).not.toBe(stripped); // ANSI codes present
		});
	});

	describe("warn method", () => {
		it("logs warning messages to console.warn", () => {
			logger.warn("Test warning message");
			expect(spyWarn).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyWarn.mock.calls[0][0] as string);
			expect(output).toContain("Test warning message");
			expect(output).toContain(logger.sym.warn);
		});

		it("handles empty string message", () => {
			logger.warn("");
			expect(spyWarn).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyWarn.mock.calls[0][0] as string);
			expect(output).toContain(logger.sym.warn);
		});

		it("calls console.warn with yellow ⚠ prefix", () => {
			logger.warn("warn test");
			expect(spyWarn).toHaveBeenCalledTimes(1);
			const raw = spyWarn.mock.calls[0][0] as string;
			const stripped = stripAnsi(raw);
			expect(stripped).toContain("⚠ warn test");
			expect(raw).not.toBe(stripped);
		});
	});

	describe("error method", () => {
		it("logs error messages to console.error", () => {
			logger.error("Test error message");
			expect(spyError).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyError.mock.calls[0][0] as string);
			expect(output).toContain("Test error message");
			expect(output).toContain(logger.sym.error);
		});

		it("handles empty string message", () => {
			logger.error("");
			expect(spyError).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyError.mock.calls[0][0] as string);
			expect(output).toContain(logger.sym.error);
		});

		it("handles error objects as messages", () => {
			const error = new Error("Test error");
			logger.error(error.message);
			expect(spyError).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyError.mock.calls[0][0] as string);
			expect(output).toContain("Test error");
		});

		it("prints hint on second line when hint is provided", () => {
			logger.error("Main error", "Try running with --verbose");
			expect(spyError).toHaveBeenCalledTimes(2);
			const hintOutput = stripAnsi(spyError.mock.calls[1][0] as string);
			expect(hintOutput).toContain("Try running with --verbose");
		});

		it("does not print hint line when no hint is provided", () => {
			logger.error("Main error");
			expect(spyError).toHaveBeenCalledTimes(1);
		});

		it("calls console.error with red ✗ prefix and colored message", () => {
			logger.error("error test");
			expect(spyError).toHaveBeenCalledTimes(1);
			const raw = spyError.mock.calls[0][0] as string;
			const stripped = stripAnsi(raw);
			expect(stripped).toContain("✗ error test");
			expect(raw).not.toBe(stripped);
		});

		it("error shows hint when provided, with dim styling", () => {
			logger.error("Oops", "Run with --debug");
			expect(spyError).toHaveBeenCalledTimes(2);
			const hintRaw = spyError.mock.calls[1][0] as string;
			expect(hintRaw).toContain("\x1b[2m"); // dim ANSI
			expect(stripAnsi(hintRaw).trim()).toBe("Run with --debug");
		});
	});

	describe("success method", () => {
		it("logs success messages to console.log", () => {
			logger.success("Test success message");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain("Test success message");
			expect(output).toContain(logger.sym.success);
		});

		it("handles empty string message", () => {
			logger.success("");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain(logger.sym.success);
		});

		it("calls console.log with green ✓ prefix", () => {
			logger.success("success test");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const raw = spyLog.mock.calls[0][0] as string;
			const stripped = stripAnsi(raw);
			expect(stripped).toContain("✓ success test");
			expect(raw).not.toBe(stripped);
		});
	});

	describe("dim method", () => {
		it("logs dimmed message to console.log", () => {
			logger.dim("Muted text");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toBe("Muted text");
		});

		it("handles empty string", () => {
			logger.dim("");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toBe("");
		});
	});

	describe("step method", () => {
		it("logs step with badge to console.log", () => {
			logger.step(2, 5, "Deploying database");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain("2/5");
			expect(output).toContain("Deploying database");
		});
	});

	describe("section method", () => {
		it("prints blank line, bold title, and dim separator", () => {
			logger.section("Configuration");
			expect(spyLog).toHaveBeenCalledTimes(3);
			expect(spyLog.mock.calls[0][0]).toBe("");
			const titleOutput = stripAnsi(spyLog.mock.calls[1][0] as string);
			expect(titleOutput).toBe("Configuration");
			const sepOutput = stripAnsi(spyLog.mock.calls[2][0] as string);
			expect(sepOutput).toMatch(/^─+$/);
		});

		it("truncates separator at 60 chars for long titles", () => {
			const longTitle = "A".repeat(80);
			logger.section(longTitle);
			expect(spyLog).toHaveBeenCalledTimes(3);
			const sepOutput = stripAnsi(spyLog.mock.calls[2][0] as string);
			expect(sepOutput.length).toBeLessThanOrEqual(60);
		});

		it("handles empty title", () => {
			logger.section("");
			expect(spyLog).toHaveBeenCalledTimes(3);
			expect(spyLog.mock.calls[0][0]).toBe("");
			const sepOutput = stripAnsi(spyLog.mock.calls[2][0] as string);
			expect(sepOutput).toBe("──");
		});

		it("outputs title and separator line correctly", () => {
			logger.section("Test Section");
			expect(spyLog).toHaveBeenCalledTimes(3);
			expect(spyLog.mock.calls[0][0]).toBe("");
			const title = spyLog.mock.calls[1][0] as string;
			expect(stripAnsi(title)).toBe("Test Section");
			const sep = spyLog.mock.calls[2][0] as string;
			expect(stripAnsi(sep)).toMatch(/^─+$/);
		});
	});

	describe("keyValue method", () => {
		it("prints indented key-value pair with padded key and cyan value", () => {
			logger.keyValue("Name", "my-project");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const raw = spyLog.mock.calls[0][0] as string;
			const stripped = stripAnsi(raw);
			const expected = `  ${"Name".padEnd(22)} my-project`;
			expect(stripped).toBe(expected);
			expect(raw).not.toBe(stripped); // value is colored
		});

		it("obscures secret values with dots", () => {
			logger.keyValue("API Key", "sk-abc123", { secret: true });
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain("API Key");
			expect(output).toContain("••••••••");
			expect(output).not.toContain("sk-abc123");
		});

		it("pads key to exactly 22 characters", () => {
			logger.keyValue("Region", "us-east-1");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const raw = spyLog.mock.calls[0][0] as string;
			const stripped = stripAnsi(raw);
			expect(stripped).toBe(`  ${"Region".padEnd(22)} us-east-1`);
		});

		it("value is colored cyan", () => {
			logger.keyValue("Env", "production");
			const raw = spyLog.mock.calls[0][0] as string;
			expect(raw).toContain("\x1b[36m"); // cyan open
			expect(raw).toContain("\x1b[39m"); // reset
		});
	});

	describe("tree method", () => {
		it("prints tree items with branch characters", () => {
			logger.tree(["src/index.ts", "src/utils/logger.ts", "package.json"]);
			expect(spyLog).toHaveBeenCalledTimes(3);
			const l1 = stripAnsi(spyLog.mock.calls[0][0] as string);
			const l2 = stripAnsi(spyLog.mock.calls[1][0] as string);
			const l3 = stripAnsi(spyLog.mock.calls[2][0] as string);
			expect(l1).toContain(logger.sym.tree.replace(/\x1b\[[0-9;]*m/g, ""));
			expect(l1).toContain("src/index.ts");
			expect(l2).toContain(logger.sym.tree.replace(/\x1b\[[0-9;]*m/g, ""));
			expect(l2).toContain("src/utils/logger.ts");
			expect(l3).toContain(logger.sym.treeLast.replace(/\x1b\[[0-9;]*m/g, ""));
			expect(l3).toContain("package.json");
		});

		it("uses treeLast for single item", () => {
			logger.tree(["only-file.ts"]);
			expect(spyLog).toHaveBeenCalledTimes(1);
			const line = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(line).toContain(logger.sym.treeLast.replace(/\x1b\[[0-9;]*m/g, ""));
			expect(line).toContain("only-file.ts");
		});

		it("handles empty array", () => {
			logger.tree([]);
			expect(spyLog).toHaveBeenCalledTimes(0);
		});

		it("outputs tree lines with proper indentation and symbols", () => {
			logger.tree(["file1.ts", "dir/file2.ts", "dir/file3.ts"]);
			expect(spyLog).toHaveBeenCalledTimes(3);
			expect(stripAnsi(spyLog.mock.calls[0][0] as string)).toBe("  ├─ file1.ts");
			expect(stripAnsi(spyLog.mock.calls[1][0] as string)).toBe("  ├─ dir/file2.ts");
			expect(stripAnsi(spyLog.mock.calls[2][0] as string)).toBe("  └─ dir/file3.ts");
		});
	});

	describe("blank method", () => {
		it("prints a single newline", () => {
			logger.blank();
			expect(spyLog).toHaveBeenCalledTimes(1);
			expect(spyLog.mock.calls[0][0]).toBe("");
		});

		it("calls console.log with empty string", () => {
			logger.blank();
			expect(spyLog).toHaveBeenCalledTimes(1);
			expect(spyLog.mock.calls[0][0]).toBe("");
		});
	});

	describe("box method", () => {
		it("prints a box with title and key-value lines", () => {
			logger.box("Deployment Info", [
				{ label: "Status", value: "active" },
				{ label: "Region", value: "us-east-1" },
			]);
			expect(spyLog).toHaveBeenCalledTimes(8);
			expect(spyLog.mock.calls[0][0]).toBe("");
			expect(stripAnsi(spyLog.mock.calls[1][0] as string)).toContain("┌");
			expect(stripAnsi(spyLog.mock.calls[1][0] as string)).toContain("┐");
			const titleLine = stripAnsi(spyLog.mock.calls[2][0] as string);
			expect(titleLine).toContain("Deployment Info");
			expect(stripAnsi(spyLog.mock.calls[3][0] as string)).toContain("├");
			expect(stripAnsi(spyLog.mock.calls[3][0] as string)).toContain("┤");
			const data1 = stripAnsi(spyLog.mock.calls[4][0] as string);
			expect(data1).toContain("Status");
			expect(data1).toContain("active");
			const data2 = stripAnsi(spyLog.mock.calls[5][0] as string);
			expect(data2).toContain("Region");
			expect(data2).toContain("us-east-1");
			expect(stripAnsi(spyLog.mock.calls[6][0] as string)).toContain("└");
			expect(stripAnsi(spyLog.mock.calls[6][0] as string)).toContain("┘");
			expect(spyLog.mock.calls[7][0]).toBe("");
		});

		it("handles empty lines array", () => {
			logger.box("Empty Box", []);
			expect(spyLog).toHaveBeenCalledTimes(6);
			expect(spyLog.mock.calls[0][0]).toBe("");
			expect(stripAnsi(spyLog.mock.calls[1][0] as string)).toContain("┌");
			expect(stripAnsi(spyLog.mock.calls[2][0] as string)).toContain("Empty Box");
			expect(stripAnsi(spyLog.mock.calls[3][0] as string)).toContain("├");
			expect(stripAnsi(spyLog.mock.calls[4][0] as string)).toContain("└");
			expect(spyLog.mock.calls[5][0]).toBe("");
		});

		it("outputs multi-line box with borders", () => {
			logger.box("Test", [{ label: "A", value: "1" }]);
			expect(spyLog).toHaveBeenCalledTimes(7);
			const lines: string[] = [];
			for (let i = 0; i < spyLog.mock.calls.length; i++) {
				lines.push(spyLog.mock.calls[i][0] as string);
			}
			expect(lines[0]).toBe("");
			expect(stripAnsi(lines[1])).toContain("┌");
			expect(stripAnsi(lines[1])).toContain("┐");
			expect(stripAnsi(lines[2])).toContain("│");
			expect(stripAnsi(lines[2])).toContain("Test");
			expect(stripAnsi(lines[3])).toContain("├");
			expect(stripAnsi(lines[3])).toContain("┤");
			expect(stripAnsi(lines[4])).toContain("A");
			expect(stripAnsi(lines[4])).toContain("1");
			expect(stripAnsi(lines[5])).toContain("└");
			expect(stripAnsi(lines[5])).toContain("┘");
			expect(lines[6]).toBe("");
		});
	});

	describe("banner method", () => {
		it("prints app name, version, and tagline", () => {
			logger.banner("1.0.0");
			expect(spyLog).toHaveBeenCalledTimes(4);
			const line1 = stripAnsi(spyLog.mock.calls[1][0] as string);
			expect(line1).toContain("betterbase");
			expect(line1).toContain("v1.0.0");
			const line2 = stripAnsi(spyLog.mock.calls[2][0] as string);
			expect(line2).toContain("AI-native Backend-as-a-Service");
		});
	});

	describe("done method", () => {
		it("prints elapsed time with success symbol", () => {
			const start = Date.now() - 1234;
			logger.done(start);
			expect(spyLog).toHaveBeenCalledTimes(1);
			const raw = spyLog.mock.calls[0][0] as string;
			const stripped = stripAnsi(raw);
			expect(stripped).toContain(logger.sym.success);
			expect(stripped).toContain("Done");
			expect(stripped).toMatch(/\(\d+\.\d+s\)/);
			expect(raw).toStartWith("\n");
		});

		it("prints custom message when provided", () => {
			const start = Date.now() - 500;
			logger.done(start, "Migration complete");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain("Migration complete");
			expect(output).toMatch(/\(\d+\.\d+s\)/);
		});

		it("prepends newline before output", () => {
			const start = Date.now() - 100;
			logger.done(start, "Done early");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const raw = spyLog.mock.calls[0][0] as string;
			expect(raw).toStartWith("\n");
		});
	});

	describe("badge method", () => {
		it("returns colored badge string for green", () => {
			const result = logger.badge("PASS", "green");
			const stripped = stripAnsi(result);
			expect(stripped).toBe(" PASS ");
		});

		it("returns colored badge string for red", () => {
			const result = logger.badge("FAIL", "red");
			const stripped = stripAnsi(result);
			expect(stripped).toBe(" FAIL ");
		});

		it("returns colored badge string for yellow", () => {
			const result = logger.badge("WARN", "yellow");
			const stripped = stripAnsi(result);
			expect(stripped).toBe(" WARN ");
		});

		it("returns colored badge string for blue", () => {
			const result = logger.badge("INFO", "blue");
			const stripped = stripAnsi(result);
			expect(stripped).toBe(" INFO ");
		});

		it("returns colored badge string for dim", () => {
			const result = logger.badge("SKIP", "dim");
			const stripped = stripAnsi(result);
			expect(stripped).toBe(" SKIP ");
		});

		it("contains ANSI color codes (not plain text)", () => {
			const result = logger.badge("PASS", "green");
			expect(stripAnsi(result)).toBe(" PASS ");
			expect(result.length).toBeGreaterThan(" PASS ".length);
		});

		it("returns correct colored badge for each color", () => {
			expect(stripAnsi(logger.badge("OK", "green"))).toBe(" OK ");
			expect(stripAnsi(logger.badge("FAIL", "red"))).toBe(" FAIL ");
			expect(stripAnsi(logger.badge("WARN", "yellow"))).toBe(" WARN ");
			expect(stripAnsi(logger.badge("INFO", "blue"))).toBe(" INFO ");
			expect(stripAnsi(logger.badge("SKIP", "dim"))).toBe(" SKIP ");
		});
	});

	describe("sym constants", () => {
		const isUnicode =
			process.platform !== "win32" ||
			Boolean(process.env.CI) ||
			Boolean(process.env.WT_SESSION);

		it("has success symbol", () => {
			expect(logger.sym.success).toBe(isUnicode ? "✓" : "+");
		});

		it("has error symbol", () => {
			expect(logger.sym.error).toBe(isUnicode ? "✗" : "x");
		});

		it("has warn symbol", () => {
			expect(logger.sym.warn).toBe(isUnicode ? "⚠" : "!");
		});

		it("has info symbol", () => {
			expect(logger.sym.info).toBe(isUnicode ? "◆" : "*");
		});

		it("has arrow symbol", () => {
			expect(logger.sym.arrow).toBe(isUnicode ? "→" : "->");
		});

		it("has bullet symbol", () => {
			expect(logger.sym.bullet).toBe(isUnicode ? "•" : "-");
		});

		it("has tree symbol", () => {
			expect(logger.sym.tree).toBe(isUnicode ? "├─" : "|-");
		});

		it("has treeLast symbol", () => {
			expect(logger.sym.treeLast).toBe(isUnicode ? "└─" : "\\-");
		});

		it("has dot symbol", () => {
			expect(logger.sym.dot).toBe(isUnicode ? "·" : ".");
		});

		it("all sym values are non-empty strings", () => {
			for (const [key, value] of Object.entries(logger.sym)) {
				expect(value, `sym.${key} should be non-empty`).toBeTruthy();
				expect(typeof value, `sym.${key} should be a string`).toBe("string");
			}
		});

		it("sym has correct emoji values when UNICODE is true", () => {
			if (isUnicode) {
				expect(logger.sym.success).toBe("✓");
				expect(logger.sym.error).toBe("✗");
				expect(logger.sym.warn).toBe("⚠");
				expect(logger.sym.info).toBe("◆");
				expect(logger.sym.arrow).toBe("→");
				expect(logger.sym.bullet).toBe("•");
				expect(logger.sym.tree).toBe("├─");
				expect(logger.sym.treeLast).toBe("└─");
				expect(logger.sym.dot).toBe("·");
			}
		});

		it("sym has ASCII fallbacks when UNICODE is false", () => {
			if (!isUnicode) {
				expect(logger.sym.success).toBe("+");
				expect(logger.sym.error).toBe("x");
				expect(logger.sym.warn).toBe("!");
				expect(logger.sym.info).toBe("*");
				expect(logger.sym.arrow).toBe("->");
				expect(logger.sym.bullet).toBe("-");
				expect(logger.sym.tree).toBe("|-");
				expect(logger.sym.treeLast).toBe("\\-");
				expect(logger.sym.dot).toBe(".");
			}
		});
	});

	describe("logging with different message types", () => {
		it("handles string messages", () => {
			logger.info("string message");
			expect(spyLog).toHaveBeenCalled();
			const infoLine = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(infoLine).toContain("string message");

			logger.warn("string message");
			expect(spyWarn).toHaveBeenCalled();
			const warnLine = stripAnsi(spyWarn.mock.calls[0][0] as string);
			expect(warnLine).toContain("string message");

			logger.error("string message");
			expect(spyError).toHaveBeenCalled();
			const errLine = stripAnsi(spyError.mock.calls[0][0] as string);
			expect(errLine).toContain("string message");

			logger.success("string message");
			const successCalls = spyLog.mock.calls.length;
			const successLine = stripAnsi(spyLog.mock.calls[successCalls - 1][0] as string);
			expect(successLine).toContain("string message");
		});

		it("handles multiline messages", () => {
			const multiline = "Line 1\nLine 2\nLine 3";
			logger.info(multiline);
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain("Line 1");
			expect(output).toContain("Line 2");
			expect(output).toContain("Line 3");
		});

		it("handles messages with quotes", () => {
			logger.info('Message with "quotes"');
			expect(spyLog).toHaveBeenCalled();
			const output1 = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output1).toContain('Message with "quotes"');

			logger.info("Message with 'single quotes'");
			const output2 = stripAnsi(spyLog.mock.calls[1][0] as string);
			expect(output2).toContain("Message with 'single quotes'");
		});

		it("handles unicode characters", () => {
			logger.info("Unicode: 你好 🌍 🚀");
			expect(spyLog).toHaveBeenCalledTimes(1);
			const output = stripAnsi(spyLog.mock.calls[0][0] as string);
			expect(output).toContain("Unicode: 你好 🌍 🚀");
		});
	});
});
