/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Prompter, PromptResult } from '../../shared/ui/prompter'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { createCommonButtons } from '../../shared/ui/buttons'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { pageableToCollection } from '../../shared/utilities/collectionUtils'
import { CloudWatchLogs } from 'aws-sdk'
import { isValidResponse, StepEstimator } from '../../shared/wizards/wizard'
import { isNonNullable } from '../../shared/utilities/tsUtils'

export enum LogStreamFilterType {
    MENU = 'menu',
    PREFIX = 'prefix',
    SPECIFIC = 'specific',
    ALL = 'all',
}

export interface LogStreamFilterResponse {
    readonly filter?: string
    readonly type: LogStreamFilterType
}

export class LogStreamFilterSubmenu extends Prompter<LogStreamFilterResponse> {
    private logStreamPrefixRegEx = /^[^:*]*$/
    private currentState: LogStreamFilterType = LogStreamFilterType.MENU
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
        const helpUri = 'https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_StartLiveTail.html'
        const prompter = createQuickPick(this.menuOptions, {
            title: 'Select LogStream filter type',
            buttons: createCommonButtons(helpUri),
        })
        return prompter
    }

    private get menuOptions(): DataQuickPickItem<LogStreamFilterType>[] {
        const options: DataQuickPickItem<LogStreamFilterType>[] = []
        options.push({
            label: 'All',
            detail: 'Include log events from all LogStreams in the selected LogGroup',
            data: LogStreamFilterType.ALL,
        })
        options.push({
            label: 'Specific',
            detail: 'Include log events from only a specific LogStream',
            data: LogStreamFilterType.SPECIFIC,
        })
        options.push({
            label: 'Prefix',
            detail: 'Include log events from LogStreams that begin with a provided prefix',
            data: LogStreamFilterType.PREFIX,
        })
        return options
    }

    public createLogStreamPrefixBox(): InputBoxPrompter {
        const helpUri =
            'https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_StartLiveTail.html#CWL-StartLiveTail-request-logStreamNamePrefixes'
        return createInputBox({
            title: 'Enter LogStream prefix',
            placeholder: 'logStream prefix (case sensitive; empty matches all)',
            prompt: 'Only log events in the LogStreams that have names that start with the prefix that you specify here are included in the Live Tail session',
            validateInput: (input) => this.validateLogStreamPrefix(input),
            buttons: createCommonButtons(helpUri),
        })
    }

    public validateLogStreamPrefix(prefix: string) {
        if (prefix.length > 512) {
            return 'LogStream prefix cannot be longer than 512 characters'
        }

        if (!this.logStreamPrefixRegEx.test(prefix)) {
            return 'LogStream prefix must match pattern: [^:*]*'
        }
    }

    public createLogStreamSelector(): QuickPickPrompter<string> {
        const helpUri =
            'https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_StartLiveTail.html#CWL-StartLiveTail-request-logStreamNames'
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
            title: 'Select LogStream',
            buttons: createCommonButtons(helpUri),
        })
    }

    private switchState(newState: LogStreamFilterType) {
        this.currentState = newState
    }

    protected async promptUser(): Promise<PromptResult<LogStreamFilterResponse>> {
        while (true) {
            switch (this.currentState) {
                case LogStreamFilterType.MENU: {
                    const prompter = this.createMenuPrompter()
                    this.steps && prompter.setSteps(this.steps[0], this.steps[1])

                    const resp = await prompter.prompt()
                    if (resp === LogStreamFilterType.PREFIX) {
                        this.switchState(LogStreamFilterType.PREFIX)
                    } else if (resp === LogStreamFilterType.SPECIFIC) {
                        this.switchState(LogStreamFilterType.SPECIFIC)
                    } else if (resp === LogStreamFilterType.ALL) {
                        return { filter: undefined, type: resp }
                    } else {
                        return undefined
                    }

                    break
                }
                case LogStreamFilterType.PREFIX: {
                    const resp = await this.createLogStreamPrefixBox().prompt()
                    if (isValidResponse(resp)) {
                        return { filter: resp, type: LogStreamFilterType.PREFIX }
                    }
                    this.switchState(LogStreamFilterType.MENU)
                    break
                }
                case LogStreamFilterType.SPECIFIC: {
                    const resp = await this.createLogStreamSelector().prompt()
                    if (isValidResponse(resp)) {
                        return { filter: resp, type: LogStreamFilterType.SPECIFIC }
                    }
                    this.switchState(LogStreamFilterType.MENU)
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
