/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IRange } from '../../../../editor/common/core/range.js';
import { DocumentSymbol, SymbolKind } from '../../../../editor/common/languages.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IOutlineModelService } from '../../../../editor/contrib/documentSymbols/browser/outlineModel.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IInlineLLMContext } from '../common/inlineLLM.js';

const SYMBOL_KIND_NAMES: Record<SymbolKind, string> = {
	[SymbolKind.File]: 'file',
	[SymbolKind.Module]: 'module',
	[SymbolKind.Namespace]: 'namespace',
	[SymbolKind.Package]: 'package',
	[SymbolKind.Class]: 'class',
	[SymbolKind.Method]: 'method',
	[SymbolKind.Property]: 'property',
	[SymbolKind.Field]: 'field',
	[SymbolKind.Constructor]: 'constructor',
	[SymbolKind.Enum]: 'enum',
	[SymbolKind.Interface]: 'interface',
	[SymbolKind.Function]: 'function',
	[SymbolKind.Variable]: 'variable',
	[SymbolKind.Constant]: 'constant',
	[SymbolKind.String]: 'string',
	[SymbolKind.Number]: 'number',
	[SymbolKind.Boolean]: 'boolean',
	[SymbolKind.Array]: 'array',
	[SymbolKind.Object]: 'object',
	[SymbolKind.Key]: 'key',
	[SymbolKind.Null]: 'null',
	[SymbolKind.EnumMember]: 'enumMember',
	[SymbolKind.Struct]: 'struct',
	[SymbolKind.Event]: 'event',
	[SymbolKind.Operator]: 'operator',
	[SymbolKind.TypeParameter]: 'typeParameter',
};

function formatSymbol(symbol: DocumentSymbol): string {
	const kindName = SYMBOL_KIND_NAMES[symbol.kind] ?? 'symbol';
	return `${kindName} ${symbol.name}`;
}

function flattenSymbols(symbols: DocumentSymbol[], out: string[], limit: number): void {
	for (const s of symbols) {
		if (out.length >= limit) {
			return;
		}
		out.push(formatSymbol(s));
		if (s.children && s.children.length > 0) {
			flattenSymbols(s.children, out, limit);
		}
	}
}

/**
 * Resolves context for the inline LLM from the current editor model and selection.
 * Document symbols are best-effort; failures are ignored.
 */
export async function resolveInlineLLMContext(
	model: ITextModel,
	selection: IRange,
	workspaceContextService: IWorkspaceContextService,
	outlineModelService: IOutlineModelService,
	token: CancellationToken
): Promise<IInlineLLMContext> {
	const selectedText = model.getValueInRange(selection);
	const fileContent = model.getValue();
	const languageId = model.getLanguageId();
	const fileUri = model.uri;

	let filePath = fileUri.fsPath;
	const workspaceFolder = workspaceContextService.getWorkspace().folders[0];
	if (workspaceFolder?.uri) {
		const rel = workspaceFolder.uri.fsPath;
		if (filePath.startsWith(rel)) {
			filePath = filePath.slice(rel.length).replace(/^[\\/]/, '') || fileUri.path.split('/').pop() || filePath;
		}
	}

	let symbols: string[] = [];
	try {
		const outlineModel = await outlineModelService.getOrCreate(model, token);
		if (!token.isCancellationRequested) {
			const list = outlineModel.asListOfDocumentSymbols();
			flattenSymbols(list, symbols, 50);
		}
	} catch {
		// Best-effort: continue without symbols
	}

	return {
		selectedText,
		fileContent,
		languageId,
		filePath,
		symbols,
		fileUri,
	};
}
