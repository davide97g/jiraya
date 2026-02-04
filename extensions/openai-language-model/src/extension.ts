/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

interface OpenAIConfiguration {
	apiKey: string;
	apiBaseUrl?: string;
}

interface OpenAIModelInfo extends vscode.LanguageModelChatInformation {
	id: string;
	name: string;
	version: string;
	family: string;
	maxInputTokens: number;
	maxOutputTokens: number;
	capabilities: {
		toolCalling: boolean;
		agentMode: boolean;
	};
	isUserSelectable: boolean;
	isDefaultForLocation?: { [key: string]: boolean };
}

// Store configuration per model identifier
const modelConfigurations = new Map<string, OpenAIConfiguration>();

export function activate(context: vscode.ExtensionContext) {
	const provider = vscode.lm.registerLanguageModelChatProvider('openai', {
		async provideLanguageModelChatInformation(
			options: vscode.PrepareLanguageModelChatModelOptions,
			token: vscode.CancellationToken
		): Promise<OpenAIModelInfo[]> {
			// Configuration is passed via options, but may not be in the type definition
			// Check if configuration exists in options (even though it's not in the type)
			const config = (options as any).configuration 
				? getConfiguration((options as any).configuration)
				: await getConfigurationFromWorkspace();
			
			if (!config || !config.apiKey) {
				if (!options.silent) {
					// Show error if not silent
					vscode.window.showErrorMessage('OpenAI API key not configured. Please configure it in Language Models settings.');
				}
				return [];
			}

			// Store configuration for later use
			const modelIds = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
			for (const modelId of modelIds) {
				modelConfigurations.set(modelId, config);
			}

			// Return available OpenAI models
			// Set GPT-4o as default for chat location
			return [
				{
					id: 'gpt-4o',
					name: 'GPT-4o',
					version: '2024-08-06',
					family: 'gpt-4',
					maxInputTokens: 128000,
					maxOutputTokens: 16384,
					capabilities: {
						toolCalling: true,
						agentMode: true,
					},
					isUserSelectable: true,
					isDefaultForLocation: {
						'chat': true,
						'editorInline': true,
					},
				},
				{
					id: 'gpt-4o-mini',
					name: 'GPT-4o Mini',
					version: '2024-07-18',
					family: 'gpt-4',
					maxInputTokens: 128000,
					maxOutputTokens: 16384,
					capabilities: {
						toolCalling: true,
						agentMode: true,
					},
					isUserSelectable: true,
				},
				{
					id: 'gpt-4-turbo',
					name: 'GPT-4 Turbo',
					version: '2024-04-09',
					family: 'gpt-4',
					maxInputTokens: 128000,
					maxOutputTokens: 4096,
					capabilities: {
						toolCalling: true,
						agentMode: true,
					},
					isUserSelectable: true,
				},
				{
					id: 'gpt-3.5-turbo',
					name: 'GPT-3.5 Turbo',
					version: '2024-02-15',
					family: 'gpt-3.5',
					maxInputTokens: 16385,
					maxOutputTokens: 4096,
					capabilities: {
						toolCalling: true,
						agentMode: true,
					},
					isUserSelectable: true,
				},
			];
		},

		async provideLanguageModelChatResponse(
			model: OpenAIModelInfo,
			messages: readonly vscode.LanguageModelChatRequestMessage[],
			options: vscode.ProvideLanguageModelChatResponseOptions,
			progress: vscode.Progress<vscode.LanguageModelResponsePart>,
			token: vscode.CancellationToken
		): Promise<void> {
			// Get configuration for this model
			const config = modelConfigurations.get(model.id) || await getConfigurationFromWorkspace();
			
			if (!config || !config.apiKey) {
				throw vscode.LanguageModelError.NoPermissions('OpenAI API key not configured');
			}

			const apiBaseUrl = (config.apiBaseUrl || 'https://api.openai.com').replace(/\/$/, '');
			const url = `${apiBaseUrl}/v1/chat/completions`;

			// Convert messages to OpenAI format
			const openAIMessages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];
			
			for (const msg of messages) {
				if (msg.role === vscode.LanguageModelChatMessageRole.User) {
					const contentParts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
					for (const part of msg.content) {
						if (part instanceof vscode.LanguageModelTextPart) {
							contentParts.push({ type: 'text', text: part.value });
						} else if (part instanceof vscode.LanguageModelDataPart) {
							// Handle data parts (could be images, etc.)
							if (part.mimeType?.startsWith('image/')) {
								const base64 = Buffer.from(part.data).toString('base64');
								const dataUri = `data:${part.mimeType};base64,${base64}`;
								contentParts.push({ type: 'image_url', image_url: { url: dataUri } });
							}
						}
					}
					openAIMessages.push({ 
						role: 'user', 
						content: contentParts.length === 1 && contentParts[0].type === 'text' ? contentParts[0].text! : contentParts 
					});
				} else if (msg.role === vscode.LanguageModelChatMessageRole.Assistant) {
					const content = msg.content
						.filter(part => part instanceof vscode.LanguageModelTextPart)
						.map(part => (part as vscode.LanguageModelTextPart).value)
						.join('');
					if (content) {
						openAIMessages.push({ role: 'assistant', content });
					}
				}
			}

			// Prepare request body
			const requestBody: any = {
				model: model.id,
				messages: openAIMessages,
				stream: true,
			};

			// Make streaming request to OpenAI
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${config.apiKey}`,
				},
				body: JSON.stringify(requestBody),
			});

			if (!response.ok) {
				const errorText = await response.text();
				let errorMessage = `OpenAI API error: ${response.status}`;
				try {
					const errorJson = JSON.parse(errorText);
					errorMessage = errorJson.error?.message || errorMessage;
				} catch {
					errorMessage = errorText || errorMessage;
				}

				if (response.status === 401) {
					throw vscode.LanguageModelError.NoPermissions(errorMessage);
				} else if (response.status === 429) {
					throw vscode.LanguageModelError.Blocked(errorMessage);
				} else {
					throw new vscode.LanguageModelError(errorMessage);
				}
			}

			if (!response.body) {
				throw new vscode.LanguageModelError('No response body from OpenAI');
			}

			// Stream the response
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			try {
				while (true) {
					if (token.isCancellationRequested) {
						reader.cancel();
						throw new vscode.LanguageModelError('Request cancelled');
					}

					const { done, value } = await reader.read();
					if (done) {
						break;
					}

					buffer += decoder.decode(value, { stream: true });
					const lines = buffer.split('\n');
					buffer = lines.pop() || '';

					for (const line of lines) {
						if (line.startsWith('data: ')) {
							const data = line.slice(6).trim();
							if (data === '[DONE]') {
								return;
							}
							if (!data) {
								continue;
							}

							try {
								const json = JSON.parse(data);
								const delta = json.choices?.[0]?.delta;
								if (delta?.content) {
									progress.report(new vscode.LanguageModelTextPart(delta.content));
								}

								// Handle tool calls
								if (delta?.tool_calls) {
									for (const toolCall of delta.tool_calls) {
										if (toolCall.function) {
											try {
												const args = JSON.parse(toolCall.function.arguments || '{}');
												progress.report(new vscode.LanguageModelToolCallPart(
													toolCall.id || '',
													toolCall.function.name,
													args
												));
											} catch (e) {
												// Ignore parse errors
											}
										}
									}
								}
							} catch (e) {
								// Ignore parse errors for incomplete chunks
							}
						}
					}
				}
			} finally {
				reader.releaseLock();
			}
		},

		async provideTokenCount(
			model: OpenAIModelInfo,
			text: string | vscode.LanguageModelChatRequestMessage,
			token: vscode.CancellationToken
		): Promise<number> {
			// Simple approximation: ~4 characters per token for English text
			// For production, you'd want to use a proper tokenizer like tiktoken
			const textContent = typeof text === 'string' 
				? text 
				: text.content
					.filter(part => part instanceof vscode.LanguageModelTextPart)
					.map(part => (part as vscode.LanguageModelTextPart).value)
					.join('');
			return Math.ceil(textContent.length / 4);
		},
	});

	context.subscriptions.push(provider);
}

function getConfiguration(config?: { readonly [key: string]: any }): OpenAIConfiguration | undefined {
	if (!config) {
		return undefined;
	}

	const apiKey = config.apiKey as string | undefined;
	if (!apiKey) {
		return undefined;
	}

	return {
		apiKey,
		apiBaseUrl: config.apiBaseUrl as string | undefined,
	};
}

async function getConfigurationFromWorkspace(): Promise<OpenAIConfiguration | undefined> {
	// Fallback: try reading from workspace configuration
	// The actual configuration should be passed via the language model groups
	const config = vscode.workspace.getConfiguration('openai');
	const apiKey = config.get<string>('apiKey');
	
	if (apiKey) {
		return {
			apiKey,
			apiBaseUrl: config.get<string>('apiBaseUrl'),
		};
	}
	
	return undefined;
}

export function deactivate() {}
