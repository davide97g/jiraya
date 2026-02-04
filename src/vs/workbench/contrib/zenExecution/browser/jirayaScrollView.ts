/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $ } from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { IListRenderer, IListVirtualDelegate } from '../../../../base/browser/ui/list/list.js';
import { DisposableStore, IDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { FileKind } from '../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { WorkbenchList } from '../../../../platform/list/browser/listService.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IResourceLabel, ResourceLabels } from '../../../browser/labels.js';
import { IViewPaneOptions, ViewPane } from '../../../browser/parts/views/viewPane.js';
import { IViewDescriptorService } from '../../../common/views.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { createFileIconThemableTreeContainerScope } from '../../files/browser/views/explorerView.js';
import { IInlineLLMChangesService, IInlineLLMFileChange } from '../../inlineLLM/browser/inlineLLMChangesService.js';
import './jirayaScrollView.css';

export const JIRAYA_SCROLL_VIEW_ID = 'workbench.view.jirayaScrollView';

interface IFileChangeItem {
	change: IInlineLLMFileChange;
}

const ELEMENT_HEIGHT = 22;
const MAX_ITEMS_SHOWN = 20;

export class JirayaScrollView extends ViewPane {

	static readonly TITLE = localize('jirayaScroll', "Jiraya Scroll");

	private list!: WorkbenchList<IFileChangeItem>;
	private applyButton!: Button;
	private explanationElement!: HTMLElement;
	private filesContainer!: HTMLElement;
	private placeholderElement!: HTMLElement;
	private readonly _disposables = new DisposableStore();

	constructor(
		options: IViewPaneOptions,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IInstantiationService override instantiationService: IInstantiationService,
		@IOpenerService openerService: IOpenerService,
		@IThemeService themeService: IThemeService,
		@IHoverService hoverService: IHoverService,
		@IInlineLLMChangesService private readonly changesService: IInlineLLMChangesService,
		@IEditorService private readonly editorService: IEditorService,
		@INotificationService private readonly notificationService: INotificationService,
	) {
		super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);
		container.classList.add('jiraya-scroll-view');

		// Placeholder
		this.placeholderElement = $('div.zen-execution-placeholder', undefined,
			$('p', undefined, localize('jirayaScrollPlaceholder', "Execution scroll and agent output will appear here during Execution mode."))
		);
		container.appendChild(this.placeholderElement);

		// Changes container (hidden initially)
		const changesContainer = $('div.jiraya-scroll-changes', undefined);
		changesContainer.style.display = 'none';
		container.appendChild(changesContainer);

		// Explanation
		this.explanationElement = $('div.jiraya-scroll-explanation');
		changesContainer.appendChild(this.explanationElement);

		// Files list container
		this.filesContainer = $('div.jiraya-scroll-files');
		changesContainer.appendChild(this.filesContainer);

		// Apply button
		const buttonContainer = $('div.jiraya-scroll-actions');
		this.applyButton = new Button(buttonContainer, { title: localize('jirayaScroll.apply', 'Apply Changes'), supportIcons: true });
		this.applyButton.label = localize('jirayaScroll.apply', 'Apply Changes');
		this.applyButton.element.classList.add('jiraya-scroll-apply-button');
		this._disposables.add(this.applyButton.onDidClick(() => this.handleApply()));
		changesContainer.appendChild(buttonContainer);

		// Setup list
		this.setupFilesList(this.filesContainer);

		// Listen to changes
		this._disposables.add(this.changesService.onDidChangeChanges(changes => {
			this.updateView(changes);
		}));

		// Initial update
		this.updateView(this.changesService.currentChanges);
	}

	private setupFilesList(container: HTMLElement): void {
		const listContainer = container.appendChild($('.jiraya-scroll-list'));
		this._disposables.add(createFileIconThemableTreeContainerScope(listContainer, this.themeService));
		const resourceLabels = this._disposables.add(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));

		this.list = this._disposables.add(this.instantiationService.createInstance(
			WorkbenchList<IFileChangeItem>,
			'JirayaScrollList',
			listContainer,
			new FileChangeListDelegate(),
			[this.instantiationService.createInstance(FileChangeListRenderer, resourceLabels)],
			{
				identityProvider: {
					getId: (element: IFileChangeItem) => element.change.filePath
				},
				setRowLineHeight: true,
				horizontalScrolling: false,
				supportDynamicHeights: false,
				mouseSupport: true,
				alwaysConsumeMouseWheel: false,
				accessibilityProvider: {
					getAriaLabel: (element: IFileChangeItem) => element.change.filePath,
					getWidgetAriaLabel: () => localize('jirayaScroll.fileChanges', "File Changes")
				}
			}
		));

		this._disposables.add(this.list.onDidOpen((e) => {
			if (!e.element) {
				return;
			}

			const change = e.element.change;
			if (change.isNewFile) {
				this.editorService.openEditor({
					resource: change.modifiedUri,
					options: { preserveFocus: true }
				});
			} else {
				this.editorService.openEditor({
					original: { resource: change.originalUri },
					modified: { resource: change.modifiedUri },
					options: { preserveFocus: true }
				});
			}
		}));
	}

	private updateView(changes: import('../../inlineLLM/browser/inlineLLMChangesService.js').IInlineLLMChanges | undefined): void {
		const hasChanges = !!changes && changes.changes.length > 0;

		if (hasChanges) {
			this.placeholderElement.style.display = 'none';
			const changesContainer = this.placeholderElement.nextElementSibling as HTMLElement;
			changesContainer.style.display = 'flex';
			changesContainer.style.flexDirection = 'column';

			// Update explanation
			if (changes.explanation) {
				this.explanationElement.textContent = changes.explanation;
				this.explanationElement.style.display = 'block';
			} else {
				this.explanationElement.style.display = 'none';
			}

			// Update list
			const items: IFileChangeItem[] = changes.changes.map(change => ({ change }));
			this.list.splice(0, this.list.length, items);

			const height = Math.min(items.length, MAX_ITEMS_SHOWN) * ELEMENT_HEIGHT;
			this.list.layout(height);
			this.filesContainer.style.height = `${height}px`;

			this.applyButton.enabled = true;
		} else {
			this.placeholderElement.style.display = 'block';
			const changesContainer = this.placeholderElement.nextElementSibling as HTMLElement;
			if (changesContainer) {
				changesContainer.style.display = 'none';
			}
			this.applyButton.enabled = false;
		}
	}

	private async handleApply(): Promise<void> {
		const result = await this.changesService.applyChanges();
		if (result.error) {
			this.notificationService.error(result.error);
		} else if (result.applied) {
			this.notificationService.info(localize('jirayaScroll.applied', 'Changes applied successfully'));
			this.changesService.clearChanges();
		}
	}

	override dispose(): void {
		this._disposables.dispose();
		super.dispose();
	}
}

class FileChangeListDelegate implements IListVirtualDelegate<IFileChangeItem> {
	getHeight(): number {
		return ELEMENT_HEIGHT;
	}

	getTemplateId(): string {
		return 'jirayaScrollFileChangeItem';
	}
}

interface IFileChangeItemTemplate extends IDisposable {
	readonly label: IResourceLabel;
	changesElement?: HTMLElement;
}

class FileChangeListRenderer implements IListRenderer<IFileChangeItem, IFileChangeItemTemplate> {
	static readonly TEMPLATE_ID = 'jirayaScrollFileChangeItem';
	static readonly CHANGES_SUMMARY_CLASS_NAME = 'insertions-and-deletions';

	readonly templateId: string = FileChangeListRenderer.TEMPLATE_ID;

	constructor(private labels: ResourceLabels) { }

	renderTemplate(container: HTMLElement): IFileChangeItemTemplate {
		const label = this.labels.create(container, { supportHighlights: true, supportIcons: true });

		return {
			label,
			dispose: () => label.dispose()
		};
	}

	renderElement(element: IFileChangeItem, _index: number, templateData: IFileChangeItemTemplate): void {
		const change = element.change;
		const uri = change.isNewFile ? change.modifiedUri : change.originalUri;

		templateData.label.setFile(uri, {
			fileKind: FileKind.FILE,
			title: change.filePath
		});

		const labelElement = templateData.label.element;
		templateData.changesElement?.remove();

		if (change.added || change.removed) {
			const changesSummary = labelElement.appendChild($(`.${FileChangeListRenderer.CHANGES_SUMMARY_CLASS_NAME}`));

			const addedElement = changesSummary.appendChild($('.insertions'));
			addedElement.textContent = `+${change.added}`;

			const removedElement = changesSummary.appendChild($('.deletions'));
			removedElement.textContent = `-${change.removed}`;

			changesSummary.setAttribute('aria-label', localize('jirayaScroll.fileCounts', '{0} lines added, {1} lines removed', change.added, change.removed));

			templateData.changesElement = changesSummary;
		}
	}

	disposeTemplate(templateData: IFileChangeItemTemplate): void {
		templateData.dispose();
	}
}
