/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { QuickPickPrompter, DataQuickPickItem, createQuickPick } from '../../shared/ui/pickerPrompter'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { isValidResponse, StepEstimator } from '../../shared/wizards/wizard'
import { createCommonButtons } from '../../shared/ui/buttons'
import * as nls from 'vscode-nls'
import { CloudWatchLogsParameters } from './registry/logDataRegistry'

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

    public constructor(private readonly oldData?: Pick<CloudWatchLogsParameters, 'startTime' | 'endTime'>) {
        super()
    }

    private get recentTimeItems(): DataQuickPickItem<number>[] {
        const options: DataQuickPickItem<number>[] = []
        // appromixate 31 days as month length (better to overshoot)
        options.push({
            label: 'All time',
            data: 0,
        })
        options.push({
            label: 'Last 15 minutes',
            data: 15,
        })
        options.push({
            label: 'Last hour',
            data: 60,
        })
        options.push({
            label: 'Last 3 Hours',
            data: 60 * 3,
        })
        options.push({
            label: 'Last 24 Hours',
            data: 60 * 24,
        })
        options.push({
            label: 'Last 3 Days',
            data: 60 * 24 * 3,
        })
        options.push({
            label: 'Last week',
            data: 60 * 24 * 7,
        })
        options.push({
            label: 'Last month',
            data: 60 * 24 * 31,
        })
        options.push({
            label: 'Last 3 months',
            data: 60 * 24 * 31 * 3,
        })
        options.push({
            label: 'Last year',
            data: 60 * 24 * 365,
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
            value: this.formatTimesToDateRange(this.oldData?.startTime, this.oldData?.endTime),
            validateInput: (input) => this.validateDate(input),
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
                        return undefined
                    }

                    break
                }
                case 'custom-range': {
                    const resp = await this.createDateBox().prompt()
                    if (isValidResponse(resp)) {
                        const [startTime, endTime] = this.parseDateRange(resp)

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

    private parseDateRange(resp: string) {
        const parts = resp.split('-')

        return [this.parseDate(parts[0]), this.parseDate(parts[1])]
    }

    private parseDate(date: string) {
        const [year, month, day] = date.split('/').map(Number)
        return new Date(Date.UTC(year, month - 1, day))
    }

    /**
     * Formats a given start and end time in milliseconds to
     * a string in the format 'YYYY/MM/DD-YYYY/MM/DD'
     *
     * Returns undefined if any of the times are not provided.
     */
    public formatTimesToDateRange(startTimeMillis?: number, endTimeMillis?: number): string | undefined {
        if (startTimeMillis === undefined || endTimeMillis === undefined) {
            return undefined
        }
        const startDate = new Date(startTimeMillis)
        const endDate = new Date(endTimeMillis)

        // Convert to string with format: YYYY/MM/DD
        const allDashes = new RegExp('-', 'g')
        const formattedStartDate = startDate.toISOString().split('T')[0].replace(allDashes, '/')
        const formattedEndDate = endDate.toISOString().split('T')[0].replace(allDashes, '/')

        return `${formattedStartDate}-${formattedEndDate}`
    }

    // Unused
    public get recentItem(): any {
        return
    }

    public set recentItem(response: any) {}
    public setStepEstimator(estimator: StepEstimator<TimeFilterResponse>): void {}
}
