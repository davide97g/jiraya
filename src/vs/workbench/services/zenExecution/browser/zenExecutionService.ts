/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { INotificationService, NotificationsFilter } from '../../../../platform/notification/common/notification.js';
import { ZenExecutionModeContext } from '../../../common/contextkeys.js';
import { IWorkbenchLayoutService, Parts } from '../../layout/browser/layoutService.js';
import {
	IZenExecutionController,
	IZenExecutionModeChangeEvent,
	ZenExecutionMode,
	canTransition
} from '../common/zenExecution.js';

interface IZenExitInfo {
	sideBarVisible: boolean;
	panelVisible: boolean;
	auxiliaryBarVisible: boolean;
	activityBarVisible: boolean;
	notificationFilterWasOff: boolean;
	centerLayout: boolean;
}

export class ZenExecutionServiceImpl extends Disposable implements IZenExecutionController {

	declare readonly _serviceBrand: undefined;

	private _mode: ZenExecutionMode = ZenExecutionMode.NORMAL;
	private _exitInfo: IZenExitInfo = {
		sideBarVisible: true,
		panelVisible: false,
		auxiliaryBarVisible: false,
		activityBarVisible: true,
		notificationFilterWasOff: true,
		centerLayout: false
	};

	private readonly _onDidChangeMode = this._register(new Emitter<IZenExecutionModeChangeEvent>());
	readonly onDidChangeMode: Event<IZenExecutionModeChangeEvent> = this._onDidChangeMode.event;

	private readonly _modeContext: ReturnType<typeof ZenExecutionModeContext.bindTo>;

	constructor(
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@INotificationService private readonly notificationService: INotificationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService
	) {
		super();
		this._modeContext = ZenExecutionModeContext.bindTo(contextKeyService);
		this._modeContext.set(this._mode);
	}

	get mode(): ZenExecutionMode {
		return this._mode;
	}

	get isAgentExecutionAllowed(): boolean {
		return this._mode === ZenExecutionMode.EXECUTION;
	}

	private setMode(to: ZenExecutionMode): void {
		if (!canTransition(this._mode, to)) {
			return;
		}
		const previous = this._mode;
		this._mode = to;
		this._modeContext.set(to);
		this.applyLayoutForMode(to, previous);
		this.applyNotificationFilterForMode(to);
		this._onDidChangeMode.fire({ previousMode: previous, mode: to });
	}

	private saveExitInfo(): void {
		this._exitInfo = {
			sideBarVisible: this.layoutService.isVisible(Parts.SIDEBAR_PART),
			panelVisible: this.layoutService.isVisible(Parts.PANEL_PART),
			auxiliaryBarVisible: this.layoutService.isVisible(Parts.AUXILIARYBAR_PART),
			activityBarVisible: this.layoutService.isVisible(Parts.ACTIVITYBAR_PART),
			notificationFilterWasOff: this.notificationService.getFilter() === NotificationsFilter.OFF,
			centerLayout: this.layoutService.isMainEditorLayoutCentered()
		};
	}

	private applyLayoutForMode(mode: ZenExecutionMode, _previous: ZenExecutionMode): void {
		switch (mode) {
			case ZenExecutionMode.NORMAL: {
				this.layoutService.setPartHidden(!this._exitInfo.sideBarVisible, Parts.SIDEBAR_PART);
				this.layoutService.setPartHidden(!this._exitInfo.panelVisible, Parts.PANEL_PART);
				this.layoutService.setPartHidden(!this._exitInfo.auxiliaryBarVisible, Parts.AUXILIARYBAR_PART);
				this.layoutService.setPartHidden(!this._exitInfo.activityBarVisible, Parts.ACTIVITYBAR_PART);
				if (this._exitInfo.centerLayout) {
					this.layoutService.centerMainEditorLayout(true);
				} else {
					this.layoutService.centerMainEditorLayout(false);
				}
				this.layoutService.layout();
				break;
			}
			case ZenExecutionMode.ZEN: {
				this.saveExitInfo();
				this.layoutService.setPartHidden(true, Parts.SIDEBAR_PART);
				this.layoutService.setPartHidden(true, Parts.PANEL_PART);
				this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
				this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
				const centerLayout = this.configurationService.getValue<boolean>('zenMode.centerLayout');
				if (centerLayout) {
					this.layoutService.centerMainEditorLayout(true);
				}
				this.layoutService.layout();
				break;
			}
			case ZenExecutionMode.EXECUTION: {
				this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
				this.layoutService.setPartHidden(false, Parts.PANEL_PART);
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				this.layoutService.setPartHidden(true, Parts.ACTIVITYBAR_PART);
				this.layoutService.centerMainEditorLayout(false);
				this.layoutService.layout();
				break;
			}
			case ZenExecutionMode.REVIEW: {
				this.layoutService.setPartHidden(false, Parts.SIDEBAR_PART);
				this.layoutService.setPartHidden(false, Parts.PANEL_PART);
				this.layoutService.setPartHidden(false, Parts.AUXILIARYBAR_PART);
				this.layoutService.setPartHidden(false, Parts.ACTIVITYBAR_PART);
				this.layoutService.centerMainEditorLayout(false);
				this.layoutService.layout();
				break;
			}
		}
	}

	private applyNotificationFilterForMode(mode: ZenExecutionMode): void {
		switch (mode) {
			case ZenExecutionMode.NORMAL:
			case ZenExecutionMode.REVIEW:
				if (this._exitInfo.notificationFilterWasOff) {
					this.notificationService.setFilter(NotificationsFilter.OFF);
				}
				break;
			case ZenExecutionMode.ZEN:
			case ZenExecutionMode.EXECUTION:
				this.notificationService.setFilter(NotificationsFilter.ERROR);
				break;
		}
	}

	async enterZen(): Promise<void> {
		this.setMode(ZenExecutionMode.ZEN);
	}

	async exitZen(): Promise<void> {
		this.setMode(ZenExecutionMode.NORMAL);
	}

	async enterExecution(): Promise<void> {
		this.setMode(ZenExecutionMode.EXECUTION);
	}

	async exitExecution(): Promise<void> {
		this.setMode(ZenExecutionMode.ZEN);
	}

	async enterReview(): Promise<void> {
		this.setMode(ZenExecutionMode.REVIEW);
	}

	async exitToNormal(): Promise<void> {
		this.setMode(ZenExecutionMode.NORMAL);
	}

	async reRun(): Promise<void> {
		this.setMode(ZenExecutionMode.EXECUTION);
	}

	notifyExecutionComplete(): void {
		if (this._mode === ZenExecutionMode.EXECUTION) {
			this.setMode(ZenExecutionMode.REVIEW);
		}
	}
}
