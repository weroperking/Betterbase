const DANGEROUS_CSV_PREFIX = /^[=+\-@\t\r\n]/;

export function escapeCSVValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	const str = String(value);
	const escaped = str.replace(/"/g, '""');

	if (DANGEROUS_CSV_PREFIX.test(str)) {
		return `"${`'${escaped}`}"`;
	}

	if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
		return `"${escaped}"`;
	}

	return str;
}
