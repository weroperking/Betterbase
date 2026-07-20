const IS_UNICODE =
	process.platform !== "win32" || Boolean(process.env.CI) || Boolean(process.env.WT_SESSION);

function colorsEnabled(): boolean {
	if (process.env.NO_COLOR) return false;
	if (process.env.FORCE_COLOR) return process.env.FORCE_COLOR !== "0";
	if (process.env.CI) return true;
	return Boolean(process.stdout?.isTTY);
}

const C = {
	reset: "\x1b[0m",
	fgReset: "\x1b[39m",
	bgReset: "\x1b[49m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	magenta: "\x1b[35m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
	gray: "\x1b[90m",
	black: "\x1b[30m",
	bgGreen: "\x1b[42m",
	bgRed: "\x1b[41m",
	bgYellow: "\x1b[43m",
	bgBlue: "\x1b[44m",
	bgCyan: "\x1b[46m",
	bgGray: "\x1b[100m",
	bold: "\x1b[1m",
	dim: "\x1b[2m",
};

type ColorFn = (s: string) => string;

function wrap(open: string, close: string): ColorFn {
	return (s: string) => {
		if (!colorsEnabled()) return s;
		return `${open}${s}${close}`;
	};
}

const chalk = {
	red: wrap(C.red, C.fgReset),
	green: wrap(C.green, C.fgReset),
	yellow: wrap(C.yellow, C.fgReset),
	blue: wrap(C.blue, C.fgReset),
	cyan: wrap(C.cyan, C.fgReset),
	white: wrap(C.white, C.fgReset),
	gray: wrap(C.gray, C.fgReset),
	black: wrap(C.black, C.fgReset),
	bgGreen: wrap(C.bgGreen, C.bgReset),
	bgRed: wrap(C.bgRed, C.bgReset),
	bgYellow: wrap(C.bgYellow, C.bgReset),
	bgBlue: wrap(C.bgBlue, C.bgReset),
	bgGray: wrap(C.bgGray, C.bgReset),
	bgCyan: wrap(C.bgCyan, C.bgReset),
	bold: wrap(C.bold, C.reset),
	dim: wrap(C.dim, C.reset),
};

function chainedBg(open: string, closeFg: string): ColorFn & { black: ColorFn; white: ColorFn } {
	const fn = ((s: string) => {
		if (!colorsEnabled()) return s;
		return `${open}${closeFg}${s}${C.reset}`;
	}) as ColorFn & { black: ColorFn; white: ColorFn };
	fn.black = (s: string) => {
		if (!colorsEnabled()) return s;
		return `${open}${C.black}${s}${C.reset}`;
	};
	fn.white = (s: string) => {
		if (!colorsEnabled()) return s;
		return `${open}${C.white}${s}${C.reset}`;
	};
	return fn;
}

chalk.bgCyan = chainedBg(C.bgCyan, C.fgReset);

export const sym = {
	success: IS_UNICODE ? "✓" : "+",
	error: IS_UNICODE ? "✗" : "x",
	warn: IS_UNICODE ? "⚠" : "!",
	info: IS_UNICODE ? "◆" : "*",
	arrow: IS_UNICODE ? "→" : "->",
	bullet: IS_UNICODE ? "•" : "-",
	tree: IS_UNICODE ? "├─" : "|-",
	treeLast: IS_UNICODE ? "└─" : "\\-",
	dot: IS_UNICODE ? "·" : ".",
};

export function success(msg: string): void {
	console.log(`${chalk.green(sym.success)} ${msg}`);
}

export function error(msg: string, hint?: string): void {
	console.error(`${chalk.red(sym.error)} ${chalk.red(msg)}`);
	if (hint) {
		console.error(`  ${chalk.dim(hint)}`);
	}
}

export function warn(msg: string): void {
	console.warn(`${chalk.yellow(sym.warn)} ${chalk.yellow(msg)}`);
}

export function info(msg: string): void {
	console.log(`${chalk.cyan(sym.info)} ${msg}`);
}

export function dim(msg: string): void {
	console.log(chalk.dim(msg));
}

export function step(n: number, total: number, msg: string): void {
	const badgeValue = (chalk.bgCyan as ColorFn & { black: ColorFn; white: ColorFn }).black(
		` ${n}/${total} `,
	);
	console.log(`${badgeValue} ${msg}`);
}

export function section(title: string): void {
	console.log("");
	console.log(chalk.bold(chalk.white(title)));
	console.log(chalk.dim("─".repeat(Math.min(title.length + 2, 60))));
}

export function keyValue(key: string, value: string, opts?: { secret?: boolean }): void {
	const displayed = opts?.secret ? chalk.dim("••••••••") : chalk.cyan(value);
	console.log(`  ${chalk.dim(key.padEnd(22))} ${displayed}`);
}

export function tree(items: string[]): void {
	items.forEach((item, i) => {
		const isLast = i === items.length - 1;
		const prefix = isLast ? sym.treeLast : sym.tree;
		console.log(`  ${chalk.dim(prefix)} ${item}`);
	});
}

export function blank(): void {
	console.log("");
}

export function banner(version: string): void {
	console.log("");
	console.log(chalk.bold(chalk.white("  betterbase")) + chalk.dim(` v${version}`));
	console.log(chalk.dim("  AI-native Backend-as-a-Service"));
	console.log("");
}

export function box(title: string, lines: { label: string; value: string }[]): void {
	const width = 60;
	const border = chalk.dim("─".repeat(width));
	console.log("");
	console.log(chalk.dim("┌") + border + chalk.dim("┐"));
	console.log(chalk.dim("│") + chalk.bold(` ${title}`).padEnd(width + 9) + chalk.dim("│"));
	console.log(chalk.dim("├") + border + chalk.dim("┤"));
	for (const line of lines) {
		const label = chalk.dim(line.label.padEnd(18));
		const value = chalk.cyan(line.value);
		const content = ` ${label} ${value}`;
		console.log(chalk.dim("│") + content.padEnd(width + 12) + chalk.dim("│"));
	}
	console.log(chalk.dim("└") + border + chalk.dim("┘"));
	console.log("");
}

export function badge(text: string, color: "green" | "red" | "yellow" | "blue" | "dim"): string {
	const fg = {
		green: C.black,
		red: C.white,
		yellow: C.black,
		blue: C.white,
		dim: C.white,
	}[color];
	const bg = {
		green: C.bgGreen,
		red: C.bgRed,
		yellow: C.bgYellow,
		blue: C.bgBlue,
		dim: C.bgGray,
	}[color];
	if (!colorsEnabled()) return ` ${text} `;
	return `${bg}${fg} ${text} ${C.reset}`;
}

export function done(startMs: number, msg?: string): void {
	const elapsed = ((Date.now() - startMs) / 1000).toFixed(2);
	console.log(`\n${chalk.green(sym.success)} ${msg ?? "Done"} ${chalk.dim(`(${elapsed}s)`)}`);
}
