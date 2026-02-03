/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../base/browser/dom.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IBulkEditService } from '../../../../editor/browser/services/bulkEditService.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IOutlineModelService } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { IOptions, ZoneWidget } from '../../../../editor/contrib/zoneWidget/browser/zoneWidget.js';
import { localize } from '../../../../nls.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IInlineLLMOutput } from '../common/inlineLLM.js';
import { resolveInlineLLMContext } from './inlineLLMContextResolver.js';
import { applyInlineLLMEdits } from './inlineLLMEditApplier.js';
import { validateInlineLLMOutput } from './inlineLLMOutputValidator.js';
import { IInlineLLMService } from './inlineLLMService.js';
import './media/inlineLLM.css';

export interface IInlineLLMZoneWidgetOptions {
	onClose: () => void;
}

export class InlineLLMZoneWidget extends ZoneWidget {

	private readonly _store = new DisposableStore();
	private _input!: HTMLInputElement;
	private _statusEl!: HTMLElement;
	private _runBtn!: HTMLButtonElement;
	private _cancelBtn!: HTMLButtonElement;
	private _applyBtn!: HTMLButtonElement;
	private _rejectBtn!: HTMLButtonElement;
	private _buttonRow!: HTMLElement;
	private _validatedOutput: IInlineLLMOutput | undefined;
	private _contextFileUri: URI | undefined;
	private _cts: CancellationTokenSource | undefined;

	constructor(
		editor: ICodeEditor,
		private readonly _selection: IRange,
		private readonly _options: IInlineLLMZoneWidgetOptions,
		@IInlineLLMService private readonly _llmService: IInlineLLMService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IOutlineModelService private readonly _outlineModelService: IOutlineModelService,
		@IModelService private readonly _modelService: IModelService,
		@IBulkEditService private readonly _bulkEditService: IBulkEditService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super(editor, {
			showFrame: true,
			frameWidth: 1,
			showArrow: false,
			isAccessible: true,
			className: 'inline-llm-zone-widget',
			keepEditorSelection: true,
			ordinal: 50001,
		} as IOptions);
		this._store.add(this);
	}

	protected override _fillContainer(container: HTMLElement): void {
		container.classList.add('inline-llm-widget-container');

		const row = dom.append(container, dom.$('.inline-llm-row'));
		this._input = document.createElement('input');
		this._input.type = 'text';
		this._input.placeholder = localize('inlineLLM.promptPlaceholder', "Describe the change...");
		this._input.className = 'inline-llm-input';
		this._input.setAttribute('aria-label', localize('inlineLLM.promptAria', "Inline LLM prompt"));
		row.appendChild(this._input);

		this._buttonRow = dom.append(row, dom.$('.inline-llm-buttons'));
		this._runBtn = document.createElement('button');
		this._runBtn.textContent = localize('inlineLLM.run', "Run");
		this._runBtn.className = 'inline-llm-btn';
		this._runBtn.setAttribute('aria-label', localize('inlineLLM.runAria', "Run Inline LLM"));
		this._cancelBtn = document.createElement('button');
		this._cancelBtn.textContent = localize('inlineLLM.cancel', "Cancel");
		this._cancelBtn.className = 'inline-llm-btn';
		this._cancelBtn.setAttribute('aria-label', localize('inlineLLM.cancelAria', "Cancel"));
		this._buttonRow.appendChild(this._runBtn);
		this._buttonRow.appendChild(this._cancelBtn);

		this._statusEl = dom.append(container, dom.$('.inline-llm-status'));
		this._setStatus('');

		this._applyBtn = document.createElement('button');
		this._applyBtn.textContent = localize('inlineLLM.apply', "Apply");
		this._applyBtn.className = 'inline-llm-btn inline-llm-apply';
		this._applyBtn.style.display = 'none';
		this._rejectBtn = document.createElement('button');
		this._rejectBtn.textContent = localize('inlineLLM.reject', "Reject");
		this._rejectBtn.className = 'inline-llm-btn';
		this._rejectBtn.style.display = 'none';
		row.appendChild(this._applyBtn);
		row.appendChild(this._rejectBtn);

		this._runBtn.addEventListener('click', () => this._handleRun());
		this._cancelBtn.addEventListener('click', () => this._handleCancel());
		this._applyBtn.addEventListener('click', () => this._handleApply());
		this._rejectBtn.addEventListener('click', () => this._handleReject());
		this._input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				this._handleRun();
			}
			if (e.key === 'Escape') {
				e.preventDefault();
				this._handleCancel();
			}
		});

		setTimeout(() => this._input.focus(), 0);
	}

	private _setStatus(text: string): void {
		this._statusEl.textContent = text;
		this._statusEl.style.display = text ? 'block' : 'none';
	}

	private _setRunning(running: boolean): void {
		this._input.disabled = running;
		this._runBtn.disabled = running;
		this._cancelBtn.disabled = !running;
	}

	private _showApplyReject(show: boolean): void {
		this._applyBtn.style.display = show ? 'inline-block' : 'none';
		this._rejectBtn.style.display = show ? 'inline-block' : 'none';
		this._runBtn.style.display = show ? 'none' : 'inline-block';
		this._cancelBtn.style.display = show ? 'none' : 'inline-block';
	}

	private async _handleRun(): Promise<void> {
		const prompt = this._input.value.trim();
		if (!prompt) {
			this._notificationService.warn(localize('inlineLLM.noPrompt', "Enter a prompt first."));
			return;
		}

		const model = this.editor.getModel();
		if (!model) {
			return;
		}

		this._setRunning(true);
		this._setStatus(localize('inlineLLM.resolving', "Building context..."));
		this._cts = new CancellationTokenSource();

		try {
			const context = await resolveInlineLLMContext(
				model,
				this._selection,
				this._workspaceContextService,
				this._outlineModelService,
				this._cts.token
			);
			this._contextFileUri = context.fileUri;

			if (this._cts.token.isCancellationRequested) {
				return;
			}
			this._setStatus(localize('inlineLLM.calling', "Calling API..."));

			const raw = await this._llmService.request(context, prompt, this._cts.token);

			if (this._cts.token.isCancellationRequested) {
				return;
			}

			const result = validateInlineLLMOutput(raw);
			if (!result.ok) {
				this._notificationService.error(result.error);
				this._setStatus('');
				return;
			}

			this._validatedOutput = result.output;
			this._setStatus(result.output.explanation || localize('inlineLLM.ready', "Review and Apply or Reject."));
			this._showApplyReject(true);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this._notificationService.error(localize('inlineLLM.error', "Inline LLM: {0}", msg));
			this._setStatus('');
		} finally {
			this._setRunning(false);
			this._cts?.dispose();
			this._cts = undefined;
		}
	}

	private _handleCancel(): void {
		this._cts?.cancel();
		this._options.onClose();
	}

	private async _handleApply(): Promise<void> {
		if (!this._validatedOutput || !this._contextFileUri) {
			return;
		}

		const result = await applyInlineLLMEdits(
			this._validatedOutput,
			this._contextFileUri,
			this._workspaceContextService,
			this._modelService,
			this._bulkEditService,
			{ showPreview: false }
		);

		if (result.error) {
			this._notificationService.error(result.error);
			return;
		}
		this._options.onClose();
	}

	private _handleReject(): void {
		this._validatedOutput = undefined;
		this._showApplyReject(false);
		this._setStatus('');
	}

	override dispose(): void {
		this._cts?.cancel();
		this._store.dispose();
		super.dispose();
	}
}
