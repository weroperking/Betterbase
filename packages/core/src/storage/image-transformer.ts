/**
 * Image Transformer Module
 *
 * Provides on-demand image transformations using Sharp library.
 * Supports WebP, JPEG, PNG, and AVIF formats with various transformation options.
 *
 * Used by Vercel, Netlify, Cloudflare and other major platforms for image optimization.
 */

import crypto from "crypto";
import { logger } from "../logger";
import type { ImageTransformOptions, TransformResult, TransformCacheKey } from "./types";

let sharp: typeof import("sharp") | undefined;
function getSharp() {
	if (!sharp) {
		try {
			sharp = require("sharp");
		} catch {
			sharp = undefined;
		}
	}
	return sharp;
}

/**
 * Supported input MIME types for transformation
 */
const SUPPORTED_INPUT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/tiff",
	"image/avif",
	"image/heif",
] as const;

/**
 * Default transformation options
 */
const DEFAULT_OPTIONS: Partial<ImageTransformOptions> = {
	format: "webp",
	quality: 80,
	fit: "cover",
};

/**
 * Maximum allowed dimensions
 */
const MAX_DIMENSION = 4000;
const MIN_DIMENSION = 1;

/**
 * ImageTransformer class for processing images with Sharp
 */
export class ImageTransformer {
	/**
	 * Apply transformations to an image buffer
	 *
	 * @param buffer - Original image buffer
	 * @param options - Transformation options
	 * @returns Promise resolving to TransformResult
	 */
	async transform(buffer: Buffer, options: ImageTransformOptions): Promise<TransformResult> {
		// Validate and normalize options
		const format = options.format || "webp";
		const quality = options.quality ?? 80;
		const fit = options.fit || "cover";
		const width = options.width;
		const height = options.height;

		logger.debug({
			msg: "Transforming image",
			format,
			quality,
			fit,
			width,
			height,
			inputSize: buffer.length,
		});

		const s = getSharp();
		if (!s) {
			throw new Error(
				"Image transformation is not available: 'sharp' is not installed for this platform. Install sharp or disable image transforms.",
			);
		}
		let sharpInstance = s(buffer);

		// Get metadata for logging
		const metadata = await sharpInstance.metadata();
		logger.debug({
			msg: "Image metadata",
			format: metadata.format,
			originalWidth: metadata.width,
			originalHeight: metadata.height,
		});

		// Apply resize if dimensions specified
		if (width || height) {
			sharpInstance = sharpInstance.resize({
				width,
				height,
				fit,
				withoutEnlargement: true,
			});
		}

		// Apply format and quality
		sharpInstance = this.applyFormat(sharpInstance, format, quality);

		// Get output buffer
		const outputBuffer = await sharpInstance.toBuffer();
		const outputMetadata = await getSharp()!(outputBuffer).metadata();

		const result: TransformResult = {
			buffer: outputBuffer,
			format,
			size: outputBuffer.length,
			width: outputMetadata.width || width || 0,
			height: outputMetadata.height || height || 0,
		};

		logger.info({
			msg: "Image transformed successfully",
			originalSize: buffer.length,
			transformedSize: result.size,
			format: result.format,
			width: result.width,
			height: result.height,
			compressionRatio: (result.size / buffer.length).toFixed(2),
		});

		return result;
	}

	/**
	 * Apply format and quality settings to Sharp instance
	 */
	private applyFormat(
		sharpInstance: any,
		format: string,
		quality: number,
	): any {
		switch (format) {
			case "webp":
				return sharpInstance.webp({ quality });
			case "jpeg":
			case "jpg":
				return sharpInstance.jpeg({ quality, mozjpeg: true });
			case "png":
				return sharpInstance.png({ quality, compressionLevel: 9 });
			case "avif":
				return sharpInstance.avif({ quality, chromaSubsampling: "4:4:4" });
			default:
				return sharpInstance.webp({ quality });
		}
	}

	/**
	 * Generate a deterministic cache key based on path and transform options
	 *
	 * @param path - Original file path
	 * @param options - Transform options
	 * @returns TransformCacheKey with path and MD5 hash
	 */
	generateCacheKey(path: string, options: ImageTransformOptions): TransformCacheKey {
		// Create deterministic string from options
		const optionsString = JSON.stringify(options, Object.keys(options).sort());
		const hash = crypto.createHash("md5").update(optionsString).digest("hex");

		return {
			path,
			hash,
		};
	}

	/**
	 * Build the cache file path for a transformed image
	 *
	 * @param cacheKey - The cache key
	 * @param format - Output format
	 * @returns Full cache path
	 */
	buildCachePath(cacheKey: TransformCacheKey, format: string): string {
		// Extract directory and filename from original path
		const lastSlash = cacheKey.path.lastIndexOf("/");
		const directory = lastSlash > 0 ? cacheKey.path.substring(0, lastSlash) : "";
		const originalName = lastSlash > 0 ? cacheKey.path.substring(lastSlash + 1) : cacheKey.path;

		// Get base name without extension
		const dotIndex = originalName.lastIndexOf(".");
		const baseName = dotIndex > 0 ? originalName.substring(0, dotIndex) : originalName;

		// Build cache path: cache/dir/basename-hash.format
		const cacheDir = directory ? `cache/${directory}` : "cache";
		const cacheFileName = `${baseName}-${cacheKey.hash}.${format}`;

		return `${cacheDir}/${cacheFileName}`;
	}

	/**
	 * Parse transform options from URL query parameters
	 *
	 * @param queryParams - Query parameters object
	 * @returns Validated ImageTransformOptions or null if invalid
	 */
	parseTransformOptions(
		queryParams: Record<string, string | undefined>,
	): ImageTransformOptions | null {
		const options: ImageTransformOptions = {};

		// Parse width
		if (queryParams.width) {
			const width = parseInt(queryParams.width, 10);
			if (!isNaN(width) && width >= MIN_DIMENSION && width <= MAX_DIMENSION) {
				options.width = width;
			} else {
				logger.warn({
					msg: "Invalid width parameter",
					value: queryParams.width,
					validRange: `${MIN_DIMENSION}-${MAX_DIMENSION}`,
				});
				return null;
			}
		}

		// Parse height
		if (queryParams.height) {
			const height = parseInt(queryParams.height, 10);
			if (!isNaN(height) && height >= MIN_DIMENSION && height <= MAX_DIMENSION) {
				options.height = height;
			} else {
				logger.warn({
					msg: "Invalid height parameter",
					value: queryParams.height,
					validRange: `${MIN_DIMENSION}-${MAX_DIMENSION}`,
				});
				return null;
			}
		}

		// Parse format
		if (queryParams.format) {
			const format = queryParams.format.toLowerCase();
			if (["webp", "jpeg", "jpg", "png", "avif"].includes(format)) {
				options.format = format as ImageTransformOptions["format"];
			} else {
				logger.warn({
					msg: "Invalid format parameter",
					value: queryParams.format,
					validFormats: ["webp", "jpeg", "png", "avif"],
				});
				return null;
			}
		}

		// Parse quality
		if (queryParams.quality) {
			const quality = parseInt(queryParams.quality, 10);
			if (!isNaN(quality) && quality >= 1 && quality <= 100) {
				options.quality = quality;
			} else {
				logger.warn({
					msg: "Invalid quality parameter",
					value: queryParams.quality,
					validRange: "1-100",
				});
				return null;
			}
		}

		// Parse fit
		if (queryParams.fit) {
			const fit = queryParams.fit.toLowerCase();
			if (["cover", "contain", "fill", "inside", "outside"].includes(fit)) {
				options.fit = fit as ImageTransformOptions["fit"];
			} else {
				logger.warn({
					msg: "Invalid fit parameter",
					value: queryParams.fit,
					validFits: ["cover", "contain", "fill", "inside", "outside"],
				});
				return null;
			}
		}

		// Return null if no valid options specified
		if (Object.keys(options).length === 0) {
			return null;
		}

		return options;
	}

	/**
	 * Check if Sharp can process the given content type
	 *
	 * @param contentType - MIME type string
	 * @returns True if the content type is supported
	 */
	isImage(contentType: string): boolean {
		return SUPPORTED_INPUT_TYPES.includes(contentType as (typeof SUPPORTED_INPUT_TYPES)[number]);
	}

	/**
	 * Get the output content type for a given format
	 *
	 * @param format - Image format
	 * @returns MIME type string
	 */
	getContentType(format: string): string {
		switch (format) {
			case "webp":
				return "image/webp";
			case "jpeg":
			case "jpg":
				return "image/jpeg";
			case "png":
				return "image/png";
			case "avif":
				return "image/avif";
			default:
				return "image/webp";
		}
	}

	/**
	 * Validate and normalize transform options
	 */
}

/**
 * Default singleton instance
 */
export const imageTransformer = new ImageTransformer();
