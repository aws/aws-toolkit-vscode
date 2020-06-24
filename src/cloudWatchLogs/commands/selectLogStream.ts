/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as picker from '../../shared/ui/picker'
import { MultiStepWizard, WizardStep } from '../../shared/wizards/multiStepWizard'
import { LogGroupNode } from '../explorer/logGroupNode'
import { CloudWatchLogs } from 'aws-sdk'
import { ext } from '../../shared/extensionGlobals'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'

export interface SelectLogStreamResponse {
    region: string
    logGroupName: string
    logStreamName: string
}

export async function selectLogStream(node: LogGroupNode): Promise<void> {
    const logStreamResponse = await new SelectLogStreamWizard(node).run()
    if (logStreamResponse) {
        vscode.window.showInformationMessage(
            `Not implemented but here's the deets:
region: ${logStreamResponse.region}
logGroup: ${logStreamResponse.logGroupName}
logStream: ${logStreamResponse.logStreamName}`
        )
    }
}

export interface SelectLogStreamWizardContext {
    pickLogStream(): Promise<string | undefined>
}

export class DefaultSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    public constructor(private readonly regionCode: string, private readonly logGroupName: string) {}

    public async pickLogStream(): Promise<string | undefined> {
        const quickPick = createDescribeLogStreamsCallPicker(this.regionCode, this.logGroupName)

        const choices = await quickPick.promptUser()
        const val = picker.verifySinglePickerOutput(choices)

        const result = val?.label

        // TODO: Handle error and no items differently? Move the check into IteratingAWSCallPicker?
        if (result && (result === quickPick.noItemsItem.label || result === quickPick.errorItem.label)) {
            return undefined
        }

        return result
    }
}

function createDescribeLogStreamsCallPicker(
    regionCode: string,
    logGroupName: string
): picker.IteratingAWSCallPicker<CloudWatchLogs.DescribeLogStreamsRequest, CloudWatchLogs.DescribeLogStreamsResponse> {
    const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(regionCode)

    return new picker.IteratingAWSCallPicker<
        CloudWatchLogs.DescribeLogStreamsRequest,
        CloudWatchLogs.DescribeLogStreamsResponse
    >(
        {
            iteratorParams: {
                // TODO: is there a better way to send this call so we don't have to `.bind(client)`?
                awsCall: client.describeLogStreams.bind(client),
                nextTokenNames: {
                    request: 'nextToken',
                    response: 'nextToken',
                },
                request: {
                    logGroupName,
                    orderBy: 'LastEventTime',
                    descending: true,
                },
            },
            awsCallResponseToQuickPickItemFn: (response: CloudWatchLogs.DescribeLogStreamsResponse) => {
                const result: vscode.QuickPickItem[] = []

                if (response.logStreams) {
                    for (const stream of response.logStreams) {
                        result.push({
                            label: stream.logStreamName!,
                            detail: stream.lastEventTimestamp
                                ? new Date(stream.lastEventTimestamp).toString()
                                : '(Log Stream has no events)',
                        })
                    }
                }

                return result
            },
        },
        {
            options: {
                title: localize('aws.cloudWatchLogs.selectLogStream.workflow.prompt', 'Select a log stream'),
                matchOnDetail: true,
            },
            isRefreshable: true,
        }
    )
}

export class SelectLogStreamWizard extends MultiStepWizard<SelectLogStreamResponse> {
    private readonly response: Partial<SelectLogStreamResponse>

    public constructor(
        node: LogGroupNode,
        private readonly context: SelectLogStreamWizardContext = new DefaultSelectLogStreamWizardContext(
            node.regionCode,
            node.logGroup.logGroupName!
        )
    ) {
        super()
        this.response = {
            region: node.regionCode,
            logGroupName: node.logGroup.logGroupName,
        }
    }

    protected get startStep(): WizardStep {
        return this.SELECT_STREAM
    }

    protected getResult(): SelectLogStreamResponse | undefined {
        if (!this.response.region || !this.response.logGroupName || !this.response.logStreamName) {
            return undefined
        }

        return {
            region: this.response.region,
            logGroupName: this.response.logGroupName,
            logStreamName: this.response.logStreamName,
        }
    }

    private readonly SELECT_STREAM: WizardStep = async () => {
        this.response.logStreamName = await this.context.pickLogStream()

        return undefined
    }
}
