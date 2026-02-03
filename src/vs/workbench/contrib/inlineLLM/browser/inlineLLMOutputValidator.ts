/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInlineLLMChange, IInlineLLMNewFile, IInlineLLMOutput, InlineLLMValidationResult } from '../common/inlineLLM.js';

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

function isChange(obj: unknown): obj is IInlineLLMChange {
	if (!obj || typeof obj !== 'object') {
		return false;
	}
	const o = obj as Record<string, unknown>;
	if (!isNonEmptyString(o.file)) {
		return false;
	}
	if (!Array.isArray(o.range) || o.range.length !== 2) {
		return false;
	}
	const [start, end] = o.range;
	if (typeof start !== 'number' || typeof end !== 'number' || start < 1 || end < 1 || start > end) {
		return false;
	}
	if (typeof o.replacement !== 'string') {
		return false;
	}
	return true;
}

function isNewFile(obj: unknown): obj is IInlineLLMNewFile {
	if (!obj || typeof obj !== 'object') {
		return false;
	}
	const o = obj as Record<string, unknown>;
	return isNonEmptyString(o.file) && typeof o.content === 'string';
}

/**
 * Parses and validates the LLM response against the strict JSON schema.
 * Returns either validated output or an error message.
 */
export function validateInlineLLMOutput(raw: string): InlineLLMValidationResult {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { ok: false, error: 'LLM returned invalid JSON' };
	}

	if (!parsed || typeof parsed !== 'object') {
		return { ok: false, error: 'LLM returned invalid format' };
	}

	const o = parsed as Record<string, unknown>;

	if (!Array.isArray(o.changes)) {
		return { ok: false, error: 'LLM response missing or invalid "changes" array' };
	}
	if (!Array.isArray(o.newFiles)) {
		return { ok: false, error: 'LLM response missing or invalid "newFiles" array' };
	}
	if (typeof o.explanation !== 'string') {
		return { ok: false, error: 'LLM response missing or invalid "explanation" string' };
	}

	const changes: IInlineLLMChange[] = [];
	for (let i = 0; i < o.changes.length; i++) {
		if (!isChange(o.changes[i])) {
			return { ok: false, error: `LLM response "changes"[${i}] has invalid shape (need file, range [startLine, endLine], replacement)` };
		}
		changes.push(o.changes[i] as IInlineLLMChange);
	}

	const newFiles: IInlineLLMNewFile[] = [];
	for (let i = 0; i < o.newFiles.length; i++) {
		if (!isNewFile(o.newFiles[i])) {
			return { ok: false, error: `LLM response "newFiles"[${i}] has invalid shape (need file, content)` };
		}
		newFiles.push(o.newFiles[i] as IInlineLLMNewFile);
	}

	const output: IInlineLLMOutput = {
		changes,
		newFiles,
		explanation: o.explanation as string,
	};
	return { ok: true, output };
}
