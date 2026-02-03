/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';

/**
 * Configuration keys for the inline LLM feature.
 */
export const enum InlineLLMConfigKeys {
	ApiBaseUrl = 'inlineLLM.apiBaseUrl',
	ApiKey = 'inlineLLM.apiKey',
}

/**
 * Context passed to the LLM for generating edits.
 */
export interface IInlineLLMContext {
	/** Selected text in the editor. */
	selectedText: string;
	/** Full content of the current file. */
	fileContent: string;
	/** Language id of the current file. */
	languageId: string;
	/** Relative path of the current file (for prompt). */
	filePath: string;
	/** Best-effort list of document symbols (e.g. "function foo", "class Bar"). */
	symbols: string[];
	/** Current file URI (for resolving relative paths in response). */
	fileUri: URI;
}

/**
 * Schema for a single text change in the LLM response.
 * Range is 1-based [startLine, endLine] (inclusive).
 */
export interface IInlineLLMChange {
	file: string;
	range: [number, number];
	replacement: string;
}

/**
 * Schema for a new file in the LLM response.
 */
export interface IInlineLLMNewFile {
	file: string;
	content: string;
}

/**
 * Strict JSON schema for LLM output. Must match this shape after validation.
 */
export interface IInlineLLMOutput {
	changes: IInlineLLMChange[];
	newFiles: IInlineLLMNewFile[];
	explanation: string;
}

/**
 * Result of validating LLM response: either valid edits or an error message.
 */
export type InlineLLMValidationResult =
	| { ok: true; output: IInlineLLMOutput }
	| { ok: false; error: string };
