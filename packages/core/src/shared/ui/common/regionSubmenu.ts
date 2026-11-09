/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import globals from '../../extensionGlobals'
import { isValidResponse, StepEstimator } from '../../wizards/wizard'
import { createQuickPick, DataQuickPickItem, ExtendedQuickPickOptions, ItemLoadTypes } from '../pickerPrompter'
import { Prompter, PromptResult } from '../prompter'
import { createRegionPrompter } from './region'
import { QuickPickPrompter } from '../pickerPrompter'
import { Region } from '../../regions/endpoints'
import { createRefreshButton } from '../buttons'
import { getLogger } from '../../logger/logger'

const switchRegion = Symbol('switchRegion')

export interface RegionSubmenuResponse<T> {
    readonly region: string
    readonly data: T
}

export class RegionSubmenu<T> extends Prompter<RegionSubmenuResponse<T>> {
    private currentState: 'data' | 'region' = 'data'
    private steps?: [current: number, total: number]
    public activePrompter?: QuickPickPrompter<typeof switchRegion | T> | QuickPickPrompter<Region>
    private readonly defaultItems: DataQuickPickItem<typeof switchRegion | T>[] = [
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
    ]

    public constructor(
        private readonly itemsProvider: (region: string) => ItemLoadTypes<T>,
        private readonly dataOptions?: ExtendedQuickPickOptions<T>,
        private readonly regionOptions?: ExtendedQuickPickOptions<T>,
        private readonly separatorLabel: string = 'Items',
        private currentRegion = globals.regionProvider.guessDefaultRegion() ?? globals.regionProvider.defaultRegionId
    ) {
        super()
    }

    public refresh(prompter: QuickPickPrompter<T | typeof switchRegion>): void {
        // This method cannot be async due to onClick() specifications. Thus we are forced to use .then, .catch as workaround.
        const activeBefore = prompter.quickPick.activeItems
        prompter
            .clearAndLoadItems(this.itemsProvider(this.currentRegion))
            .then(() => {
                prompter.quickPick.items = [...this.defaultItems, ...prompter.quickPick.items]
                prompter.quickPick.activeItems = activeBefore
            })
            .catch((e) => {
                getLogger().error('clearAndLoadItems failed: %s', (e as Error).message)
            })
    }

    private createMenuPrompter() {
        const refreshButton = createRefreshButton()
        const items = this.itemsProvider(this.currentRegion)
        const prompter = createQuickPick<T | typeof switchRegion>(items, {
            ...this.dataOptions,
            buttons: [...(this.dataOptions?.buttons ?? []), refreshButton],
        } as ExtendedQuickPickOptions<T | typeof switchRegion>)

        prompter.quickPick.items = [...this.defaultItems, ...prompter.quickPick.items]

        refreshButton.onClick = () => this.refresh(prompter)

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
