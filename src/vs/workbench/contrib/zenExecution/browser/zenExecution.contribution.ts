/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { IViewContainersRegistry, IViewsRegistry, Extensions as ViewContainerExtensions, ViewContainerLocation } from '../../../common/views.js';
import { IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ZenExecutionServiceImpl } from '../../../services/zenExecution/browser/zenExecutionService.js';
import { IZenExecutionController, ZenExecutionMode } from '../../../services/zenExecution/common/zenExecution.js';
import { JIRAYA_SCROLL_VIEW_ID, JirayaScrollView } from './jirayaScrollView.js';
import { WORK_ARTIFACTS_VIEW_ID, WorkArtifactsView } from './workArtifactsView.js';
import './zenExecution.css';

const workArtifactsViewIcon = registerIcon('zen-execution-work-artifacts', Codicon.library, localize('workArtifactsIcon', 'Work Artifacts view icon'));
const jirayaScrollViewIcon = registerIcon('zen-execution-jiraya-scroll', Codicon.scrollbarButtonLeft, localize('jirayaScrollIcon', 'Jiraya Scroll view icon'));

export const WORK_ARTIFACTS_CONTAINER_ID = 'workbench.view.workArtifacts';
export const JIRAYA_SCROLL_CONTAINER_ID = 'workbench.view.jirayaScroll';

registerSingleton(IZenExecutionController, ZenExecutionServiceImpl, InstantiationType.Delayed);

const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewContainerExtensions.ViewContainersRegistry);
const viewsRegistry = Registry.as<IViewsRegistry>(ViewContainerExtensions.ViewsRegistry);

const workArtifactsViewContainer = viewContainersRegistry.registerViewContainer({
	id: WORK_ARTIFACTS_CONTAINER_ID,
	title: localize2('workArtifacts', 'Work Artifacts'),
	icon: workArtifactsViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [WORK_ARTIFACTS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	order: 0,
	hideIfEmpty: true,
}, ViewContainerLocation.Sidebar);

const jirayaScrollViewContainer = viewContainersRegistry.registerViewContainer({
	id: JIRAYA_SCROLL_CONTAINER_ID,
	title: localize2('jirayaScroll', 'Jiraya Scroll'),
	icon: jirayaScrollViewIcon,
	ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [JIRAYA_SCROLL_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
	order: 0,
	hideIfEmpty: true,
}, ViewContainerLocation.AuxiliaryBar);

viewsRegistry.registerViews([{
	id: WORK_ARTIFACTS_VIEW_ID,
	name: localize2('workArtifacts', 'Work Artifacts'),
	containerIcon: workArtifactsViewIcon,
	ctorDescriptor: new SyncDescriptor(WorkArtifactsView),
	canToggleVisibility: true,
	canMoveView: true,
	order: 1,
}], workArtifactsViewContainer);

viewsRegistry.registerViews([{
	id: JIRAYA_SCROLL_VIEW_ID,
	name: localize2('jirayaScroll', 'Jiraya Scroll'),
	containerIcon: jirayaScrollViewIcon,
	ctorDescriptor: new SyncDescriptor(JirayaScrollView),
	canToggleVisibility: true,
	canMoveView: true,
	order: 1,
}], jirayaScrollViewContainer);

function registerModeCommand(id: string, title: string, from: ZenExecutionMode, to: ZenExecutionMode, run: (controller: IZenExecutionController) => Promise<void>) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title: localize2(id + '.title', title),
				category: localize2('zenExecutionCategory', 'Zen Execution'),
				f1: true,
				precondition: ContextKeyExpr.equals('zenExecutionMode', from),
			});
		}
		override async run(accessor: ServicesAccessor): Promise<void> {
			const controller = accessor.get(IZenExecutionController);
			await run(controller);
		}
	});
}

registerModeCommand('jiraya.zenExecution.enterZen', 'Enter Zen Mode', ZenExecutionMode.NORMAL, ZenExecutionMode.ZEN, c => c.enterZen());
registerModeCommand('jiraya.zenExecution.exitZen', 'Exit Zen Mode', ZenExecutionMode.ZEN, ZenExecutionMode.NORMAL, c => c.exitZen());
registerModeCommand('jiraya.zenExecution.enterExecution', 'Enter Execution Mode', ZenExecutionMode.ZEN, ZenExecutionMode.EXECUTION, c => c.enterExecution());
registerModeCommand('jiraya.zenExecution.exitExecution', 'Exit Execution Mode', ZenExecutionMode.EXECUTION, ZenExecutionMode.ZEN, c => c.exitExecution());
registerModeCommand('jiraya.zenExecution.enterReview', 'Enter Review Mode', ZenExecutionMode.EXECUTION, ZenExecutionMode.REVIEW, c => c.enterReview());
registerModeCommand('jiraya.zenExecution.exitToNormal', 'Exit to Normal', ZenExecutionMode.REVIEW, ZenExecutionMode.NORMAL, c => c.exitToNormal());
registerModeCommand('jiraya.zenExecution.reRun', 'Re-run Execution', ZenExecutionMode.REVIEW, ZenExecutionMode.EXECUTION, c => c.reRun());

class ZenExecutionWorkbenchContribution extends Disposable {
	static readonly ID = 'workbench.contrib.zenExecution';

	private breathingDotEntry: ReturnType<IStatusbarService['addEntry']> | undefined;

	constructor(
		@IZenExecutionController private readonly zenExecutionController: IZenExecutionController,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
	) {
		super();
		this._register(this.zenExecutionController.onDidChangeMode(e => this.onModeChange(e.mode)));
		this.onModeChange(this.zenExecutionController.mode);
	}

	private onModeChange(mode: ZenExecutionMode): void {
		if (mode === ZenExecutionMode.EXECUTION) {
			const entry = {
				name: localize('zenExecutionBreathingDot', 'Execution mode'),
				text: '$(primitive-dot)',
				ariaLabel: localize('executionModeActive', 'Execution mode active'),
				kind: 'prominent' as const,
			};
			this.breathingDotEntry = this.statusbarService.addEntry(
				entry,
				'zenExecution-breathingDot',
				StatusbarAlignment.RIGHT,
				10000
			);
		} else {
			this.breathingDotEntry?.dispose();
			this.breathingDotEntry = undefined;
		}
	}
}

registerWorkbenchContribution2(ZenExecutionWorkbenchContribution.ID, ZenExecutionWorkbenchContribution, WorkbenchPhase.AfterRestored);
