/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { EditPresentationTypes, Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerAction2 } from '../../../../platform/actions/common/actions.js';
import { InlineLLMAction } from './inlineLLMActions.js';
import { IInlineLLMService } from './inlineLLMService.js';
import { InlineLLMServiceImpl } from './inlineLLMService.js';
import { InlineLLMConfigKeys } from '../common/inlineLLM.js';

registerSingleton(IInlineLLMService, InlineLLMServiceImpl, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'inlineLLM',
	title: localize('inlineLLM.configTitle', "Inline LLM"),
	properties: {
		[InlineLLMConfigKeys.ApiBaseUrl]: {
			description: localize('inlineLLM.apiBaseUrl', "OpenAI-compatible API base URL (e.g. https://api.openai.com)."),
			type: 'string',
			default: '',
			order: 1,
		},
		[InlineLLMConfigKeys.ApiKey]: {
			description: localize('inlineLLM.apiKey', "API key for the Inline LLM endpoint. Stored in settings."),
			type: 'string',
			default: '',
			order: 2,
		},
		[InlineLLMConfigKeys.SystemPrompt]: {
			description: localize('inlineLLM.systemPrompt', "Master system prompt for Inline LLM requests. Configure the assistant's behavior and output format."),
			type: 'string',
			default: '',
			order: 3,
			editPresentation: EditPresentationTypes.Multiline,
		},
	},
});

registerAction2(InlineLLMAction);
