/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import globals from '../../extensionGlobals'
import { isValidResponse, StepEstimator } from '../../wizards/wizard'
import { createQuickPick, ExtendedQuickPickOptions, ItemLoadTypes } from '../pickerPrompter'
import { Prompter, PromptResult } from '../prompter'
import { createRegionPrompter } from './region'
import { QuickPickPrompter } from '../pickerPrompter'
import { Region } from '../../regions/endpoints'

const switchRegion = Symbol('switchRegion')

export interface RegionSubmenuResponse<T> {
    readonly region: string
    readonly data: T
}

export class RegionSubmenu<T> extends Prompter<RegionSubmenuResponse<T>> {
    private currentState: 'data' | 'region' = 'data'
    private steps?: [current: number, total: number]
    public activePrompter?: QuickPickPrompter<typeof switchRegion | T> | QuickPickPrompter<Region>

    public constructor(
        private readonly itemsProvider: (region: string) => ItemLoadTypes<T>,
        private readonly dataOptions?: ExtendedQuickPickOptions<T>,
        private readonly regionOptions?: ExtendedQuickPickOptions<T>,
        private readonly separatorLabel: string = 'Items',
        private currentRegion = globals.regionProvider.guessDefaultRegion() ?? globals.regionProvider.defaultRegionId
    ) {
        super()
    }

    private createMenuPrompter() {
        const prompter = createQuickPick<T | typeof switchRegion>(
            this.itemsProvider(this.currentRegion),
            this.dataOptions as ExtendedQuickPickOptions<T | typeof switchRegion>
        )

        prompter.quickPick.items = [
            {
                label: 'Actions',
                kind: vscode.QuickPickItemKind.Separator,
                data: undefined,
            },
            {
                label: 'Switch Region',
                data: switchRegion,
                description: `current region: ${this.currentRegion}`,
            },
            {
                label: this.separatorLabel,
                kind: vscode.QuickPickItemKind.Separator,
                data: undefined,
            },
            ...prompter.quickPick.items,
        ]
        return prompter
    }

    private switchState(newState: 'data' | 'region') {
        this.currentState = newState
    }

    protected async promptUser(): Promise<PromptResult<RegionSubmenuResponse<T>>> {
        while (true) {
            switch (this.currentState) {
                case 'data': {
                    const prompter = (this.activePrompter = this.createMenuPrompter())
                    this.steps && prompter.setSteps(this.steps[0], this.steps[1])

                    const resp = await prompter.prompt()
                    if (resp === switchRegion) {
                        this.switchState('region')
                    } else if (isValidResponse(resp)) {
                        return { region: this.currentRegion, data: resp }
                    } else {
                        return resp
                    }

                    break
                }
                case 'region': {
                    const prompter = (this.activePrompter = createRegionPrompter(undefined, {
                        defaultRegion: this.currentRegion,
                        ...this.regionOptions,
                    }))

                    const resp = await prompter.prompt()
                    if (isValidResponse(resp)) {
                        this.currentRegion = resp.id
                    }

                    this.switchState('data')

                    break
                }
            }
        }
    }

    public setSteps(current: number, total: number): void {
        this.steps = [current, total]
    }

    // Unused
    public get recentItem(): any {
        return
    }

    public set recentItem(response: any) {}
    public setStepEstimator(estimator: StepEstimator<RegionSubmenuResponse<T>>): void {}
}
