/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Prompter, PromptResult } from '../shared/ui/prompter'
import { InputBoxPrompter } from '../shared/ui/inputPrompter'
import { ItemLoadTypes, QuickPickPrompter, DataQuickPickItem, createQuickPick } from '../shared/ui/pickerPrompter'
import { createInputBox } from '../shared/ui/inputPrompter'
import { isValidResponse, StepEstimator } from '../shared/wizards/wizard'
import { createCommonButtons } from '../shared/ui/buttons'
import * as nls from 'vscode-nls'

const localize = nls.loadMessageBundle()

export function isViewAllEvents(response: TimeFilterResponse) {
    return response.start === response.end
}

export interface TimeFilterResponse {
    // # of miliseconds since january 1, 1970 since thats what API expects.
    readonly start: number
    readonly end: number
}

const customRange = Symbol('customRange')

export class TimeFilterSubmenu extends Prompter<TimeFilterResponse> {
    // TODO: Generalize submenu code between this and the region Submenu.
    private currentState: 'custom-range' | 'recent-range' = 'recent-range'
    private steps?: [current: number, total: number]
    public defaultPrompter: QuickPickPrompter<typeof customRange | number> = this.createMenuPrompter()

    public constructor() {
        super()
    }

    private get recentTimeItems(): ItemLoadTypes<number> {
        const options: DataQuickPickItem<number>[] = []
        options.push({
            label: 'Any time',
            data: 0,
        })
        options.push({
            label: 'Last 1 Minute',
            data: 1,
        })
        options.push({
            label: 'Last 30 Minutes',
            data: 30,
        })
        options.push({
            label: 'Last 1 Hour',
            data: 60,
        })
        options.push({
            label: 'Last 12 Hours',
            data: 60 * 12,
        })
        return options
    }

    public createMenuPrompter() {
        const prompter = createQuickPick<number | typeof customRange>(this.recentTimeItems, {
            title: 'Select Time Filter',
            buttons: createCommonButtons(),
        })

        prompter.quickPick.items = [
            ...prompter.quickPick.items,
            {
                label: 'Custom time range',
                data: customRange,
                detail: `YYYY/MM/DD-YYYY/MM/DD`,
            },
        ]

        return prompter
    }

    private switchState(newState: 'custom-range' | 'recent-range') {
        this.currentState = newState
    }

    public createDateBox(): InputBoxPrompter {
        return createInputBox({
            title: 'Enter custom date range',
            placeholder: 'YYYY/MM/DD-YYYY/MM/DD',
            validateInput: input => this.validateDate(input),
            buttons: createCommonButtons(),
        })
    }

    protected async promptUser(): Promise<PromptResult<TimeFilterResponse>> {
        while (true) {
            switch (this.currentState) {
                case 'recent-range': {
                    const prompter = this.createMenuPrompter()
                    this.steps && prompter.setSteps(this.steps[0], this.steps[1])

                    const resp = await prompter.prompt()
                    if (resp === customRange) {
                        this.switchState('custom-range')
                    } else if (isValidResponse(resp)) {
                        const [endTime, startTime] = [new Date(), new Date()]
                        startTime.setMinutes(endTime.getMinutes() - resp)

                        return { start: startTime.valueOf(), end: endTime.valueOf() }
                    } else {
                        return resp
                    }

                    break
                }
                case 'custom-range': {
                    const resp = await this.createDateBox().prompt()
                    if (isValidResponse(resp)) {
                        const [startTime, endTime] = this.parseDate(resp)

                        return { start: startTime.valueOf(), end: endTime.valueOf() }
                    }

                    this.switchState('recent-range')

                    break
                }
            }
        }
    }

    public validateDate(input: string) {
        const parts = input.split('-')

        if (parts.length !== 2) {
            return localize('AWS.cwl.validateDate.notTwoDates', 'String must include two dates seperated by `-`')
        }
        const [startTime, endTime] = parts

        if (!Date.parse(startTime)) {
            return localize('AWS.cwl.validateDate.startTimeInvalid', 'starting time format is invalid, use YYYY/MM/DD')
        }
        if (!Date.parse(endTime)) {
            return localize('AWS.cwl.validateDate.endTimeInvalid', 'ending time format is valid, use YYYY/MM/DD')
        }
        const regEx = /^\d{4}\/\d{2}\/\d{2}$/
        if (!startTime.match(regEx) || !endTime.match(regEx)) {
            return localize('AWS.cwl.validateDate.dateFormat', 'enter date in format YYYY/MM/DD-YYYY/MM/DD')
        }
        if (startTime === endTime) {
            return localize('AWS.cwl.validateDate.sameDateError', 'must enter two different dates for valid range')
        }
        if (Date.parse(startTime) > Date.parse(endTime)) {
            return localize('AWS.cwl.validateDate.startBeforeEndDate', 'first date must occur before second date')
        }
    }

    public setSteps(current: number, total: number): void {
        this.steps = [current, total]
    }

    private parseDate(resp: string) {
        const parts = resp.split('-')
        return [new Date(parts[0]), new Date(parts[1])]
    }

    // Unused
    public get recentItem(): any {
        return
    }

    public set recentItem(response: any) {}
    public setStepEstimator(estimator: StepEstimator<TimeFilterResponse>): void {}
}
