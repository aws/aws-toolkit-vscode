/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Prompter, PromptResult } from '../../../shared/ui/prompter'
import { DefaultCloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { createCommonButtons } from '../../../shared/ui/buttons'
import { createInputBox, InputBoxPrompter } from '../../../shared/ui/inputPrompter'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../../shared/ui/pickerPrompter'
import { pageableToCollection } from '../../../shared/utilities/collectionUtils'
import { CloudWatchLogs } from 'aws-sdk'
import { isValidResponse, StepEstimator } from '../../../shared/wizards/wizard'
import { isNonNullable } from '../../../shared/utilities/tsUtils'
import {
    startLiveTailHelpUrl,
    startLiveTailLogStreamNamesHelpUrl,
    startLiveTailLogStreamPrefixHelpUrl,
} from '../../../shared/constants'

export type LogStreamFilterType = 'menu' | 'prefix' | 'specific' | 'all'

export interface LogStreamFilterResponse {
    readonly filter?: string
    readonly type: LogStreamFilterType
}

export class LogStreamFilterSubmenu extends Prompter<LogStreamFilterResponse> {
    private logStreamPrefixRegEx = /^[^:*]*$/
    private currentState: LogStreamFilterType = 'menu'
    private steps?: [current: number, total: number]
    private region: string
    private logGroupArn: string
    public defaultPrompter: QuickPickPrompter<LogStreamFilterType> = this.createMenuPrompter()

    public constructor(logGroupArn: string, region: string) {
        super()
        this.region = region
        this.logGroupArn = logGroupArn
    }

    public createMenuPrompter() {
        const helpUri = startLiveTailHelpUrl
        const prompter = createQuickPick(this.menuOptions, {
            title: 'Include log events from...',
            buttons: createCommonButtons(helpUri),
        })
        return prompter
    }

    private get menuOptions(): DataQuickPickItem<LogStreamFilterType>[] {
        const options: DataQuickPickItem<LogStreamFilterType>[] = []
        options.push({
            label: 'All Log Streams',
            data: 'all',
        })
        options.push({
            label: 'Specific Log Stream',
            data: 'specific',
        })
        options.push({
            label: 'Log Streams matching prefix',
            data: 'prefix',
        })
        return options
    }

    public createLogStreamPrefixBox(): InputBoxPrompter {
        const helpUri = startLiveTailLogStreamPrefixHelpUrl
        return createInputBox({
            title: 'Enter Log Stream prefix',
            placeholder: 'log stream prefix (case sensitive; empty matches all)',
            prompt: 'Only log events in Log Streams whose name starts with the supplied prefix will be included.',
            validateInput: (input) => this.validateLogStreamPrefix(input),
            buttons: createCommonButtons(helpUri),
        })
    }

    public validateLogStreamPrefix(prefix: string) {
        if (prefix.length > 512) {
            return 'Log Stream prefix cannot be longer than 512 characters'
        }

        if (!this.logStreamPrefixRegEx.test(prefix)) {
            return 'Log Stream prefix must match pattern: [^:*]*'
        }
    }

    public createLogStreamSelector(): QuickPickPrompter<string> {
        const helpUri = startLiveTailLogStreamNamesHelpUrl
        const client = new DefaultCloudWatchLogsClient(this.region)
        const request: CloudWatchLogs.DescribeLogStreamsRequest = {
            logGroupIdentifier: this.logGroupArn,
            orderBy: 'LastEventTime',
            descending: true,
        }
        const requester = (request: CloudWatchLogs.DescribeLogStreamsRequest) => client.describeLogStreams(request)
        const collection = pageableToCollection(requester, request, 'nextToken', 'logStreams')

        const items = collection
            .filter(isNonNullable)
            .map((streams) => streams!.map((stream) => ({ data: stream.logStreamName!, label: stream.logStreamName! })))

        return createQuickPick(items, {
            title: 'Select Log Stream',
            buttons: createCommonButtons(helpUri),
        })
    }

    private switchState(newState: LogStreamFilterType) {
        this.currentState = newState
    }

    protected async promptUser(): Promise<PromptResult<LogStreamFilterResponse>> {
        while (true) {
            switch (this.currentState) {
                case 'menu': {
                    const prompter = this.createMenuPrompter()
                    this.steps && prompter.setSteps(this.steps[0], this.steps[1])

                    const resp = await prompter.prompt()
                    if (resp === 'prefix') {
                        this.switchState('prefix')
                    } else if (resp === 'specific') {
                        this.switchState('specific')
                    } else if (resp === 'all') {
                        return { filter: undefined, type: resp }
                    } else {
                        return undefined
                    }

                    break
                }
                case 'prefix': {
                    const resp = await this.createLogStreamPrefixBox().prompt()
                    if (isValidResponse(resp)) {
                        return { filter: resp, type: 'prefix' }
                    }
                    this.switchState('menu')
                    break
                }
                case 'specific': {
                    const resp = await this.createLogStreamSelector().prompt()
                    if (isValidResponse(resp)) {
                        return { filter: resp, type: 'specific' }
                    }
                    this.switchState('menu')
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
    public setStepEstimator(estimator: StepEstimator<LogStreamFilterResponse>): void {}
}
