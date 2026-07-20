import { z } from "zod";

/**
 * Column builder DSL for the IaC `defineTable` shape.
 *
 * Provides a higher-level, chainable API over the Zod-backed `v.*` validators:
 *
 *   text("id").primaryKey()
 *   text("email").notNull().unique()
 *   timestamp("created_at").defaultNow().notNull()
 *
 * Each builder wraps a base Zod schema (so it still satisfies the
 * `z.ZodRawShape` expected by `defineTable`) while carrying metadata that
 * downstream generators (migrations, Drizzle schema) can read via `_col`.
 */

export interface ColumnMeta {
	name: string;
	primaryKey?: boolean;
	notNull?: boolean;
	unique?: boolean;
	defaultNow?: boolean;
}

export type ColumnBuilder<T extends z.ZodTypeAny> = T & {
	_col: ColumnMeta;
	primaryKey(): ColumnBuilder<T>;
	notNull(): ColumnBuilder<T>;
	unique(): ColumnBuilder<T>;
	defaultNow(): ColumnBuilder<T>;
	optional(): ColumnBuilder<z.ZodOptional<T>>;
};

function make<T extends z.ZodTypeAny>(base: T, name: string): ColumnBuilder<T> {
	const builder = base as ColumnBuilder<T>;
	builder._col = { name };

	builder.primaryKey = () => {
		builder._col.primaryKey = true;
		return builder;
	};
	builder.notNull = () => {
		builder._col.notNull = true;
		return builder;
	};
	builder.unique = () => {
		builder._col.unique = true;
		return builder;
	};
	builder.defaultNow = () => {
		builder._col.defaultNow = true;
		return builder;
	};
	builder.optional = () => {
		const opt = make(base.optional(), builder._col.name);
		opt._col = { ...builder._col };
		return opt;
	};

	return builder;
}

export function text(name: string): ColumnBuilder<z.ZodString> {
	return make(z.string(), name);
}

export function number(name: string): ColumnBuilder<z.ZodNumber> {
	return make(z.number(), name);
}

export function boolean(name: string): ColumnBuilder<z.ZodBoolean> {
	return make(z.boolean(), name);
}

export function timestamp(name: string): ColumnBuilder<z.ZodString> {
	return make(z.string().datetime({ offset: true }), name);
}

export function id(name: string): ColumnBuilder<z.ZodString> {
	return make(z.string(), name);
}
