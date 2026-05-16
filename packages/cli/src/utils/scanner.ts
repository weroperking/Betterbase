import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { z } from "zod";
import * as logger from "./logger";

export const ColumnTypeSchema = z.enum([
	"text",
	"integer",
	"number",
	"boolean",
	"datetime",
	"json",
	"blob",
	"unknown",
]);

export const ColumnInfoSchema = z.object({
	name: z.string(),
	type: ColumnTypeSchema,
	nullable: z.boolean(),
	unique: z.boolean(),
	primaryKey: z.boolean(),
	defaultValue: z.string().optional(),
	references: z.string().optional(),
	// Raw Drizzle type method name (e.g., 'text', 'varchar', 'integer')
	dataType: z.string().optional(),
	// Array modifier
	array: z.boolean().optional(),
	// Enum values if column uses .enum()
	enum: z.array(z.string()).optional(),
});

export const TableInfoSchema = z.object({
	name: z.string(),
	columns: z.record(z.string(), ColumnInfoSchema),
	relations: z.array(z.string()),
	indexes: z.array(z.string()),
});

export const TablesRecordSchema = z.record(z.string(), TableInfoSchema);

export type ColumnInfo = z.infer<typeof ColumnInfoSchema>;
export type TableInfo = z.infer<typeof TableInfoSchema>;

function unwrapExpression(expression: ts.Expression): ts.Expression {
	let current = expression;

	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isTypeAssertionExpression(current) ||
		ts.isSatisfiesExpression(current)
	) {
		current = (
			current as
				| ts.ParenthesizedExpression
				| ts.AsExpression
				| ts.TypeAssertion
				| ts.SatisfiesExpression
		).expression;
	}

	return current;
}

function getCallName(call: ts.CallExpression): string {
	if (ts.isIdentifier(call.expression)) {
		return call.expression.text;
	}

	if (ts.isPropertyAccessExpression(call.expression)) {
		return call.expression.name.text;
	}

	return "";
}

function getExpressionText(sourceFile: ts.SourceFile, node: ts.Node | undefined): string {
	if (!node) {
		return "";
	}

	return node.getText(sourceFile);
}

export class SchemaScanner {
	private readonly sourceFile: ts.SourceFile;

	constructor(schemaPath: string) {
		let sourceCode: string;

		try {
			sourceCode = readFileSync(schemaPath, "utf-8");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to read schema file at ${schemaPath}: ${message}`);
		}

		this.sourceFile = ts.createSourceFile(
			schemaPath,
			sourceCode,
			ts.ScriptTarget.Latest,
			true,
			ts.ScriptKind.TS,
		);
	}

	scan(): Record<string, TableInfo> {
		const tables: Record<string, TableInfo> = {};

		const visit = (node: ts.Node): void => {
			if (ts.isVariableStatement(node)) {
				for (const declaration of node.declarationList.declarations) {
					if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
						continue;
					}

					const initializer = unwrapExpression(declaration.initializer);
					if (!ts.isCallExpression(initializer)) {
						continue;
					}

					const functionName = getCallName(initializer);
					if (
						functionName === "sqliteTable" ||
						functionName === "pgTable" ||
						functionName === "mysqlTable"
					) {
						const tableObj = this.parseTable(initializer);
						// Use the variable name as the key, per spec (easier for codegen)
						const tableKey = declaration.name.text;
						tables[tableKey] = tableObj;
					}
				}
			}

			ts.forEachChild(node, visit);
		};

		visit(this.sourceFile);

		return TablesRecordSchema.parse(tables);
	}

	private parseTable(callExpression: ts.CallExpression): TableInfo {
		const [nameArg, columnsArg, indexesArg] = callExpression.arguments;
		const tableName = ts.isStringLiteral(nameArg)
			? nameArg.text
			: getExpressionText(this.sourceFile, nameArg);

		const columns: Record<string, ColumnInfo> = {};
		const relations: string[] = [];

		if (columnsArg && ts.isObjectLiteralExpression(columnsArg)) {
			for (const property of columnsArg.properties) {
				if (!ts.isPropertyAssignment(property)) {
					continue;
				}

				const columnName = ts.isIdentifier(property.name)
					? property.name.text
					: ts.isStringLiteral(property.name)
						? property.name.text
						: property.name.getText(this.sourceFile);

				const columnInfo = this.parseColumn(columnName, property.initializer);
				columns[columnName] = columnInfo;

				if (columnInfo.references) {
					relations.push(columnInfo.references);
				}
			}
		}

		const indexes = this.parseIndexes(indexesArg);

		return {
			name: tableName,
			columns,
			relations,
			indexes,
		};
	}

	private parseIndexes(indexesArg: ts.Expression | undefined): string[] {
		if (!indexesArg) {
			return [];
		}

		const indexes: string[] = [];
		const indexRoot = unwrapExpression(indexesArg);

		const collectFromObject = (obj: ts.ObjectLiteralExpression): void => {
			for (const property of obj.properties) {
				if (!ts.isPropertyAssignment(property)) {
					continue;
				}

				let value = unwrapExpression(property.initializer);
				const MAX_ITER = 50;
				let iter = 0;

				while (ts.isCallExpression(value)) {
					iter += 1;
					if (iter > MAX_ITER) {
						logger.warn(
							`SchemaScanner parseIndexes reached MAX_ITER=${MAX_ITER} while scanning index chain: ${value.getText(this.sourceFile)}`,
						);
						break;
					}
					const callName = getCallName(value);
					if (callName === "index" || callName === "uniqueIndex") {
						const key = ts.isIdentifier(property.name)
							? property.name.text
							: ts.isStringLiteral(property.name)
								? property.name.text
								: property.name.getText(this.sourceFile);
						indexes.push(key);
						break;
					}

					// Handle .on() method chain - index().on(column) should still find the index
					if (callName === "on") {
						// Look deeper in the chain to find the original index/uniqueIndex call
						let inner: ts.CallExpression | undefined = value;
						while (inner) {
							const innerCallName = getCallName(inner);
							if (innerCallName === "index" || innerCallName === "uniqueIndex") {
								const key = ts.isIdentifier(property.name)
									? property.name.text
									: ts.isStringLiteral(property.name)
										? property.name.text
										: property.name.getText(this.sourceFile);
								indexes.push(key);
								break;
							}
							// Move to the next level in the chain
							if (
								ts.isPropertyAccessExpression(inner.expression) &&
								ts.isCallExpression(inner.expression.expression)
							) {
								inner = inner.expression.expression;
							} else {
								break;
							}
						}
						if (indexes.length > 0) break;
					}

					if (ts.isPropertyAccessExpression(value.expression)) {
						value = unwrapExpression(value.expression.expression);
						continue;
					}

					break;
				}
			}
		};

		if (ts.isArrowFunction(indexRoot) || ts.isFunctionExpression(indexRoot)) {
			const body = indexRoot.body;
			if (!ts.isBlock(body)) {
				const unwrappedBody = unwrapExpression(body);
				if (ts.isObjectLiteralExpression(unwrappedBody)) {
					collectFromObject(unwrappedBody);
				}
			}

			if (ts.isBlock(body)) {
				for (const statement of body.statements) {
					if (!ts.isReturnStatement(statement) || !statement.expression) {
						continue;
					}

					const expression = unwrapExpression(statement.expression);
					if (ts.isObjectLiteralExpression(expression)) {
						collectFromObject(expression);
					}
				}
			}
		}

		return indexes;
	}

	private parseColumn(columnName: string, expression: ts.Expression): ColumnInfo {
		let type: ColumnInfo["type"] = "unknown";
		let dataType: string | undefined = undefined; // raw type method name
		let nullable = true;
		let unique = false;
		let primaryKey = false;
		let defaultValue: string | undefined;
		let references: string | undefined;
		let array = false;
		let enumValues: string[] | undefined = undefined;

		let current = unwrapExpression(expression);

		while (ts.isCallExpression(current)) {
			const methodName = getCallName(current);

			// Type methods: set both dataType and simplified type
			if (!dataType && (methodName === "text" || methodName === "varchar" || methodName === "char")) {
				dataType = methodName;
				type = "text";
			} else if (!dataType && (
				methodName === "integer" ||
				methodName === "int" ||
				methodName === "bigint" ||
				methodName === "serial"
			)) {
				dataType = methodName;
				type = "integer";
			} else if (!dataType && (
				methodName === "real" ||
				methodName === "numeric" ||
				methodName === "decimal" ||
				methodName === "doublePrecision"
			)) {
				dataType = methodName;
				type = "number";
			} else if (!dataType && methodName === "boolean") {
				dataType = methodName;
				type = "boolean";
			} else if (!dataType && (methodName === "timestamp" || methodName === "datetime")) {
				dataType = methodName;
				type = "datetime";
			} else if (!dataType && (methodName === "json" || methodName === "jsonb")) {
				dataType = methodName;
				type = "json";
			} else if (!dataType && methodName === "blob") {
				dataType = methodName;
				type = "blob";
			} else if (methodName === "notNull") {
				nullable = false;
			} else if (methodName === "unique") {
				unique = true;
			} else if (methodName === "primaryKey") {
				primaryKey = true;
				nullable = false;
			} else if (methodName.startsWith("default")) {
				defaultValue = getExpressionText(this.sourceFile, current.arguments[0]);
			} else if (methodName === "references") {
				references = getExpressionText(this.sourceFile, current.arguments[0]);
			} else if (methodName === "array") {
				array = true;
			} else if (methodName === "enum") {
				// Extract enum values from first argument (array literal)
				if (current.arguments.length > 0) {
					const arg = current.arguments[0];
					if (ts.isArrayLiteralExpression(arg)) {
						enumValues = arg.elements.map(el => {
							if (ts.isStringLiteral(el) || ts.isNoSubstitutionTemplateLiteral(el)) {
								return el.text;
							}
							return el.getText(this.sourceFile);
						});
					}
				}
			}

			if (ts.isPropertyAccessExpression(current.expression)) {
				current = unwrapExpression(current.expression.expression);
				continue;
			}

			break;
		}

		return {
			name: columnName,
			type,
			nullable,
			unique,
			primaryKey,
			defaultValue,
			references,
			dataType,
			array,
			enum: enumValues,
		};
	}
}
