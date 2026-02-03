/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../base/common/buffer.js';
import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IBulkEditService, ResourceEdit, ResourceFileEdit, ResourceTextEdit } from '../../../../editor/browser/services/bulkEditService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IInlineLLMOutput } from '../common/inlineLLM.js';

const MAX_END_COLUMN = 100000;

function resolveFileUri(relativePath: string, workspaceFolderUri: URI | undefined, currentFileUri: URI): URI {
	const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
	if (workspaceFolderUri) {
		return URI.joinPath(workspaceFolderUri, normalized);
	}
	// Fallback: resolve relative to current file's directory
	const currentDir = URI.joinPath(dirname(currentFileUri), normalized);
	return currentDir;
}

/**
 * Converts validated LLM output to ResourceEdit[] and applies via IBulkEditService.
 * Uses a single undo group so one Undo reverts all edits.
 */
export async function applyInlineLLMEdits(
	output: IInlineLLMOutput,
	contextFileUri: URI,
	workspaceContextService: IWorkspaceContextService,
	modelService: IModelService,
	bulkEditService: IBulkEditService,
	options?: { showPreview?: boolean }
): Promise<{ applied: boolean; error?: string }> {
	const workspaceFolder = workspaceContextService.getWorkspace().folders[0];
	const workspaceFolderUri = workspaceFolder?.uri;

	const edits: ResourceEdit[] = [];

	for (const change of output.changes) {
		const resource = resolveFileUri(change.file, workspaceFolderUri, contextFileUri);
		const [startLine, endLine] = change.range;
		let endColumn = MAX_END_COLUMN;
		const model = modelService.getModel(resource);
		if (model) {
			const lastLine = Math.min(endLine, model.getLineCount());
			endColumn = model.getLineMaxColumn(lastLine);
		}
		const range = new Range(startLine, 1, endLine, endColumn);
		edits.push(new ResourceTextEdit(resource, { range, text: change.replacement }));
	}

	for (const nf of output.newFiles) {
		const resource = resolveFileUri(nf.file, workspaceFolderUri, contextFileUri);
		edits.push(
			new ResourceFileEdit(undefined, resource, {
				contents: Promise.resolve(VSBuffer.fromString(nf.content)),
			})
		);
	}

	if (edits.length === 0) {
		return { applied: true };
	}

	try {
		const result = await bulkEditService.apply(edits, {
			label: 'Inline LLM',
			showPreview: options?.showPreview ?? false,
		});
		return { applied: result.isApplied };
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		return { applied: false, error: `Edits could not be applied: ${error}` };
	}
}
