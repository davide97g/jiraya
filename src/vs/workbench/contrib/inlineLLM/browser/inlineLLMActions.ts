/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { isCodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { localize2 } from '../../../../nls.js';
import { Action2, IAction2Options, MenuId } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { InlineLLMZoneWidget } from './inlineLLMWidget.js';

const HEIGHT_IN_LINES = 6;

export class InlineLLMAction extends Action2 {

	constructor() {
		super({
			id: 'editor.action.inlineLLM',
			title: localize2('inlineLLM.title', "Inline LLM"),
			shortTitle: localize2('inlineLLM.shortTitle', "Inline LLM"),
			category: localize2('inlineLLM.category', "Inline LLM"),
			f1: true,
			precondition: ContextKeyExpr.and(
				EditorContextKeys.editorTextFocus,
				EditorContextKeys.writable,
				EditorContextKeys.editorSimpleInput.negate()
			),
			keybinding: {
				when: EditorContextKeys.editorTextFocus,
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyL,
			},
			menu: [
				{
					id: MenuId.EditorContext,
					group: '1_modification',
					order: 4,
					when: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, EditorContextKeys.writable),
				},
			],
		} as IAction2Options);
	}

	override run(accessor: ServicesAccessor, ..._args: unknown[]): void {
		const codeEditorService = accessor.get(ICodeEditorService);
		const editor = codeEditorService.getActiveCodeEditor();
		if (!editor || !isCodeEditor(editor) || editor.isSimpleWidget) {
			return;
		}

		const model = editor.getModel();
		if (!model) {
			return;
		}

		const selection = editor.getSelection();
		const range = selection ?? Range.fromPositions(editor.getPosition() ?? { lineNumber: 1, column: 1 });

		const insta = accessor.get(IInstantiationService);
		const widget = insta.createInstance(InlineLLMZoneWidget, editor, range, {
			onClose: () => {
				widget.dispose();
			},
		});

		widget.create();
		widget.show(range, HEIGHT_IN_LINES);
	}
}
