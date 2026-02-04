/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IZenExecutionController = createDecorator<IZenExecutionController>('zenExecutionController');

export const enum ZenExecutionMode {
	NORMAL = 'NORMAL',
	ZEN = 'ZEN',
	EXECUTION = 'EXECUTION',
	REVIEW = 'REVIEW'
}

export interface IZenExecutionModeChangeEvent {
	readonly previousMode: ZenExecutionMode;
	readonly mode: ZenExecutionMode;
}

export interface IZenExecutionController {
	readonly _serviceBrand: undefined;

	/**
	 * Current Zen/Execution/Review mode.
	 */
	readonly mode: ZenExecutionMode;

	/**
	 * Fired when the mode changes.
	 */
	readonly onDidChangeMode: Event<IZenExecutionModeChangeEvent>;

	/**
	 * Transition to ZEN mode (from NORMAL only).
	 */
	enterZen(): Promise<void>;

	/**
	 * Exit ZEN and return to NORMAL.
	 */
	exitZen(): Promise<void>;

	/**
	 * Transition to EXECUTION mode (from ZEN only).
	 */
	enterExecution(): Promise<void>;

	/**
	 * Exit EXECUTION and return to ZEN.
	 */
	exitExecution(): Promise<void>;

	/**
	 * Transition to REVIEW mode (from EXECUTION or via command).
	 */
	enterReview(): Promise<void>;

	/**
	 * Exit to NORMAL (from REVIEW).
	 */
	exitToNormal(): Promise<void>;

	/**
	 * Re-run: REVIEW -> EXECUTION.
	 */
	reRun(): Promise<void>;

	/**
	 * Notify that agent execution completed (EXECUTION -> REVIEW).
	 */
	notifyExecutionComplete(): void;

	/**
	 * Whether agent execution is allowed in the current mode.
	 */
	readonly isAgentExecutionAllowed: boolean;
}

/** Valid transitions: from -> to[] */
export const ZEN_EXECUTION_TRANSITIONS: Record<ZenExecutionMode, ZenExecutionMode[]> = {
	[ZenExecutionMode.NORMAL]: [ZenExecutionMode.ZEN],
	[ZenExecutionMode.ZEN]: [ZenExecutionMode.NORMAL, ZenExecutionMode.EXECUTION],
	[ZenExecutionMode.EXECUTION]: [ZenExecutionMode.ZEN, ZenExecutionMode.REVIEW],
	[ZenExecutionMode.REVIEW]: [ZenExecutionMode.NORMAL, ZenExecutionMode.EXECUTION]
};

export function canTransition(from: ZenExecutionMode, to: ZenExecutionMode): boolean {
	return ZEN_EXECUTION_TRANSITIONS[from].includes(to);
}
