/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { asText, isSuccess } from '../../../../platform/request/common/request.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IInlineLLMContext, InlineLLMConfigKeys } from '../common/inlineLLM.js';

export const IInlineLLMService = createDecorator<IInlineLLMService>('IInlineLLMService');

export interface IInlineLLMService {
	readonly _serviceBrand: undefined;

	/**
	 * Sends context and user prompt to the configured OpenAI-compatible API
	 * and returns the raw response text (expected to be JSON per schema).
	 */
	request(context: IInlineLLMContext, userPrompt: string, token: CancellationToken): Promise<string>;
}

// Default system prompt used when no custom prompt is configured.
// Kept in a separate constant so the full text is easy to reuse as a default value.
const SYSTEM_PROMPT = `You are a code assistant. The user will provide:
1. Selected code (or full file)
2. The full file content and path
3. Optional list of document symbols

You must respond with ONLY a single JSON object (no markdown, no explanation outside JSON) in this exact schema:
{
  "changes": [
    {
      "file": "relative/path/to/file.ts",
      "range": [startLine, endLine],
      "replacement": "new code for that range"
    }
  ],
  "newFiles": [
    {
      "file": "relative/path/newfile.ts",
      "content": "full file content"
    }
  ],
  "explanation": "short explanation of intent"
}

- Use 1-based line numbers for range.
- "file" paths must be relative to the workspace root.
- For the current file, use the same relative path the user provided.
- If no edits are needed, return empty "changes" and "newFiles" with an explanation.`;

function getDefaultSystemPrompt(): string {
	return SYSTEM_PROMPT;
}

function buildUserMessage(context: IInlineLLMContext, userPrompt: string): string {
	const parts: string[] = [
		`File: ${context.filePath}`,
		`Language: ${context.languageId}`,
		'',
		'--- Selected code ---',
		context.selectedText || '(no selection)',
		'--- Full file ---',
		context.fileContent,
	];

	if (context.symbols.length > 0) {
		parts.push('', '--- Document symbols (best-effort) ---', context.symbols.join('\n'));
	}

	parts.push('', '--- User request ---', userPrompt);

	return parts.join('\n');
}

export class InlineLLMServiceImpl implements IInlineLLMService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IRequestService private readonly _requestService: IRequestService,
		@ILogService private readonly _logService: ILogService,
	) {}

	async request(context: IInlineLLMContext, userPrompt: string, token: CancellationToken): Promise<string> {
		const baseUrl = this._configurationService.getValue<string>(InlineLLMConfigKeys.ApiBaseUrl)?.trim();
		const apiKey = this._configurationService.getValue<string>(InlineLLMConfigKeys.ApiKey)?.trim();

		if (!baseUrl) {
			throw new Error('Inline LLM: API base URL not configured (inlineLLM.apiBaseUrl)');
		}
		if (!apiKey) {
			throw new Error('Inline LLM: API key not configured (inlineLLM.apiKey)');
		}

		const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions';
		const userMessage = buildUserMessage(context, userPrompt);

		const configuredSystemPrompt = this._configurationService.getValue<string>(InlineLLMConfigKeys.SystemPrompt)?.trim();
		const systemPrompt = configuredSystemPrompt || getDefaultSystemPrompt();

		const body = {
			model: 'gpt-4o-mini',
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userMessage },
			],
			stream: false,
			max_tokens: 4096,
		};

		this._logService.trace('[InlineLLM] Requesting', url);

		const response = await this._requestService.request(
			{
				type: 'POST',
				url,
				data: JSON.stringify(body),
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${apiKey}`,
				},
				timeout: 60000,
			},
			token
		);

		if (!isSuccess(response)) {
			const status = response.res.statusCode ?? 'unknown';
			this._logService.error('[InlineLLM] Request failed', status);
			throw new Error(`Inline LLM: API returned ${status}`);
		}

		const text = await asText(response);
		if (text === null) {
			throw new Error('Inline LLM: Empty response');
		}

		// OpenAI-compatible: choices[0].message.content
		try {
			const json = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
			const content = json.choices?.[0]?.message?.content;
			if (typeof content === 'string') {
				return content;
			}
		} catch {
			// Not JSON or wrong shape: treat whole response as the model output (e.g. raw JSON)
		}

		return text;
	}
}
