/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Prompter, PromptResult } from '../shared/ui/prompter'
import { InputBoxPrompter } from '../shared/ui/inputPrompter'
import { ItemLoadTypes, QuickPickPrompter, DataQuickPickItem, createQuickPick } from '../shared/ui/pickerPrompter'
import { createInputBox } from '../shared/ui/inputPrompter'
import { isValidResponse, StepEstimator } from '../shared/wizards/wizard'

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
    public customPrompter: InputBoxPrompter = this.createDateBox()

    public constructor() {
        super()
    }

    private get recentTimeOptions(): ItemLoadTypes<number> {
        const options: DataQuickPickItem<number>[] = []
        options.push({
            label: 'View all events',
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
        const prompter = createQuickPick<number | typeof customRange>(this.recentTimeOptions)

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
        })
    }

    protected async promptUser(): Promise<PromptResult<TimeFilterResponse>> {
        while (true) {
            switch (this.currentState) {
                case 'recent-range': {
                    this.steps && this.defaultPrompter.setSteps(this.steps[0], this.steps[1])

                    const resp = await this.defaultPrompter.prompt()
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
                    const resp = await this.customPrompter.prompt()
                    if (isValidResponse(resp)) {
                        const [startTime, endTime] = this.parseDate(resp)

                        return { start: startTime.valueOf(), end: endTime.valueOf() }
                    }

                    this.defaultPrompter = this.createMenuPrompter() //reload the defaultPrompter
                    this.switchState('recent-range')

                    break
                }
            }
        }
    }

    public validateDate(input: string) {
        const parts = input.split('-')
        const today = new Date()

        if (parts.length !== 2) {
            return 'String must include two dates seperated by `-`'
        }
        const [startTime, endTime] = parts

        if (!Date.parse(startTime)) {
            return 'starting time format is invalid, use YYYY/MM/DD'
        }
        if (!Date.parse(endTime)) {
            return 'ending time format is valid, use YYYY/MM/DD'
        }
        const regEx = /^\d{4}\/\d{2}\/\d{2}$/
        if (!startTime.match(regEx) || !endTime.match(regEx)) {
            return 'enter date in format YYYY/MM/DD-YYYY/MM/DD'
        }
        if (startTime === endTime) {
            return 'must enter two different dates for valid range'
        }
        if (Date.parse(startTime) > Date.parse(endTime)) {
            return 'first date must occur before second date'
        }

        if (Date.parse(endTime) > today.valueOf()) {
            return 'end date cannot be in the future'
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
