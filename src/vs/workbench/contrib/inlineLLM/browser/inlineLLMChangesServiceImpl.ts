/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { dirname } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IInlineLLMOutput } from '../common/inlineLLM.js';
import { IInlineLLMChanges, IInlineLLMChangesService, IInlineLLMFileChange } from './inlineLLMChangesService.js';
import { applyInlineLLMEdits } from './inlineLLMEditApplier.js';

function resolveFileUri(relativePath: string, workspaceFolderUri: URI | undefined, currentFileUri: URI): URI {
	const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
	if (workspaceFolderUri) {
		return URI.joinPath(workspaceFolderUri, normalized);
	}
	// Fallback: resolve relative to current file's directory
	const currentDir = URI.joinPath(dirname(currentFileUri), normalized);
	return currentDir;
}

const PREVIEW_SCHEME = 'inline-llm-preview';

class InlineLLMPreviewContentProvider extends Disposable implements ITextModelContentProvider {
	private readonly _models = new Map<string, string>();

	constructor(
		@IModelService private readonly _modelService: IModelService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();
	}

	setContent(uri: URI, content: string): void {
		this._models.set(uri.toString(), content);
	}

	clearContent(uri: URI): void {
		this._models.delete(uri.toString());
		const model = this._modelService.getModel(uri);
		if (model) {
			model.dispose();
		}
	}

	async provideTextContent(uri: URI): Promise<ITextModel | null> {
		const content = this._models.get(uri.toString());
		if (content === undefined) {
			return null;
		}
		// Create or return existing model
		let model = this._modelService.getModel(uri);
		if (!model) {
			model = this._modelService.createModel(
				content,
				this._languageService.createByFilepathOrFirstLine(uri),
				uri
			);
		}
		return model;
	}
}

export class InlineLLMChangesServiceImpl extends Disposable implements IInlineLLMChangesService {
	declare readonly _serviceBrand: undefined;

	private _currentChanges: IInlineLLMChanges | undefined;
	private _currentOutput: IInlineLLMOutput | undefined;
	private _currentContextFileUri: URI | undefined;
	private _currentWorkspaceFolderUri: URI | undefined;
	private _previewContentProvider!: InlineLLMPreviewContentProvider;
	private readonly _onDidChangeChanges = this._register(new Emitter<IInlineLLMChanges | undefined>());
	readonly onDidChangeChanges = this._onDidChangeChanges.event;

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@ILanguageService private readonly _languageService: ILanguageService,
	) {
		super();
		this._previewContentProvider = this._register(new InlineLLMPreviewContentProvider(this._modelService, this._languageService));
		this._register(this._textModelService.registerTextModelContentProvider(PREVIEW_SCHEME, this._previewContentProvider));
	}

	get currentChanges(): IInlineLLMChanges | undefined {
		return this._currentChanges;
	}

	async setChanges(output: IInlineLLMOutput, contextFileUri: URI, workspaceFolderUri: URI | undefined): Promise<void> {
		// Clear previous changes
		this.clearChanges();

		this._currentOutput = output;
		this._currentContextFileUri = contextFileUri;
		this._currentWorkspaceFolderUri = workspaceFolderUri || this._workspaceContextService.getWorkspace().folders[0]?.uri;

		const workspaceFolder = this._currentWorkspaceFolderUri;
		const fileChanges: IInlineLLMFileChange[] = [];

		// Process text edits
		for (const change of output.changes) {
			const originalUri = resolveFileUri(change.file, workspaceFolder, contextFileUri);

			// Get original content
			let originalContent = '';
			try {
				const model = this._modelService.getModel(originalUri);
				if (model) {
					originalContent = model.getValue();
				}
			} catch {
				// File might not exist, treat as empty
			}

			// Create modified content by applying the replacement
			const originalLines = originalContent.split('\n');
			const [startLine, endLine] = change.range;
			const modifiedLines = [
				...originalLines.slice(0, startLine - 1),
				...change.replacement.split('\n'),
				...originalLines.slice(endLine)
			];
			const modifiedContent = modifiedLines.join('\n');

			// Create preview URI and store content
			const modifiedUri = URI.from({ scheme: PREVIEW_SCHEME, path: `/${change.file}` });
			this._previewContentProvider.setContent(modifiedUri, modifiedContent);

			// Create model reference to compute diff
			const modifiedModelRef = await this._textModelService.createModelReference(modifiedUri);
			try {
				// Compute diff statistics
				const diff = await this._editorWorkerService.computeDiff(
					originalUri,
					modifiedUri,
					{ ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: 3000 },
					'advanced'
				);

				let added = 0;
				let removed = 0;
				if (diff) {
					for (const diffChange of diff.changes) {
						removed += diffChange.original.endLineNumberExclusive - diffChange.original.startLineNumber;
						added += diffChange.modified.endLineNumberExclusive - diffChange.modified.startLineNumber;
					}
				}

				fileChanges.push({
					originalUri,
					modifiedUri,
					filePath: change.file,
					added,
					removed,
					isNewFile: false,
				});
			} finally {
				modifiedModelRef.dispose();
			}
		}

		// Process new files
		for (const nf of output.newFiles) {
			const originalUri = URI.from({ scheme: 'file', path: '/dev/null' });
			const modifiedUri = URI.from({ scheme: PREVIEW_SCHEME, path: `/${nf.file}` });

			// Store content in provider
			this._previewContentProvider.setContent(modifiedUri, nf.content);

			const added = nf.content.split('\n').length;
			fileChanges.push({
				originalUri,
				modifiedUri,
				filePath: nf.file,
				added,
				removed: 0,
				isNewFile: true,
			});
		}

		this._currentChanges = {
			changes: fileChanges,
			explanation: output.explanation,
			contextFileUri,
		};

		this._onDidChangeChanges.fire(this._currentChanges);
	}

	clearChanges(): void {
		if (this._currentChanges) {
			// Clean up preview content
			for (const change of this._currentChanges.changes) {
				if (change.modifiedUri.scheme === PREVIEW_SCHEME) {
					this._previewContentProvider.clearContent(change.modifiedUri);
					const model = this._modelService.getModel(change.modifiedUri);
					if (model) {
						model.dispose();
					}
				}
			}
		}
		this._currentChanges = undefined;
		this._currentOutput = undefined;
		this._currentContextFileUri = undefined;
		this._currentWorkspaceFolderUri = undefined;
		this._onDidChangeChanges.fire(undefined);
	}

	async applyChanges(): Promise<{ applied: boolean; error?: string }> {
		if (!this._currentOutput || !this._currentContextFileUri) {
			return { applied: false, error: 'No changes to apply' };
		}

		// Use the existing applyInlineLLMEdits function
		return await applyInlineLLMEdits(
			this._currentOutput,
			this._currentContextFileUri,
			this._workspaceContextService,
			this._modelService,
			this._bulkEditService,
			{ showPreview: false }
		);
	}
}
