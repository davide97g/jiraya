/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IInlineLLMOutput } from '../common/inlineLLM.js';

export interface IInlineLLMFileChange {
	/** Original file URI */
	originalUri: URI;
	/** Modified file URI (temporary preview) */
	modifiedUri: URI;
	/** Relative file path */
	filePath: string;
	/** Number of lines added */
	added: number;
	/** Number of lines removed */
	removed: number;
	/** Whether this is a new file */
	isNewFile: boolean;
}

export interface IInlineLLMChanges {
	/** List of file changes */
	changes: IInlineLLMFileChange[];
	/** Explanation from LLM */
	explanation: string;
	/** Context file URI */
	contextFileUri: URI;
}

export const IInlineLLMChangesService = createDecorator<IInlineLLMChangesService>('IInlineLLMChangesService');

export interface IInlineLLMChangesService {
	readonly _serviceBrand: undefined;

	/** Current changes being reviewed */
	readonly currentChanges: IInlineLLMChanges | undefined;

	/** Event fired when changes are available */
	readonly onDidChangeChanges: Event<IInlineLLMChanges | undefined>;

	/** Set the current changes from inline LLM output */
	setChanges(output: IInlineLLMOutput, contextFileUri: URI, workspaceFolderUri: URI | undefined): Promise<void>;

	/** Clear the current changes */
	clearChanges(): void;

	/** Apply the current changes */
	applyChanges(): Promise<{ applied: boolean; error?: string }>;
}
