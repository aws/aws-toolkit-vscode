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
import { IteratingAWSCall } from '../../shared/utilities/collectionUtils'

export interface SelectLogStreamResponse {
    region: string
    logGroup: string
    logStream: string
}

export async function selectLogStream(node: LogGroupNode): Promise<void> {
    const logStreamResponse = await new SelectLogStreamWizard(node).run()
    if (logStreamResponse) {
        vscode.window.showInformationMessage(
            `Not implemented but here's the deets:
region: ${logStreamResponse.region}
logGroup: ${logStreamResponse.logGroup}
logStream: ${logStreamResponse.logStream}`
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

        return val?.label
    }
}

function createDescribeLogStreamsCallPicker(
    regionCode: string,
    logGroupName: string
): picker.IteratingAWSCallPicker<CloudWatchLogs.DescribeLogStreamsRequest, CloudWatchLogs.DescribeLogStreamsResponse> {
    const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(regionCode)

    return new picker.IteratingAWSCallPicker(
        {
            iteratingAwsCall: new IteratingAWSCall(client.describeLogStreams.bind(client), {
                request: 'nextToken',
                response: 'nextToken',
            }),
            initialRequest: {
                logGroupName,
                orderBy: 'LastEventTime',
                descending: true,
                limit: 1, // TODO: remove, for testing purposes
            },
            awsResponseToQuickPickItem: (response: CloudWatchLogs.DescribeLogStreamsResponse) => {
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
                ignoreFocusOut: true, // TODO: remove, present for testing purposes
            },
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
            logGroup: node.logGroup.arn,
        }
    }

    protected get startStep(): WizardStep {
        return this.SELECT_STREAM
    }

    protected getResult(): SelectLogStreamResponse | undefined {
        if (!this.response.region || !this.response.logGroup || !this.response.logStream) {
            return undefined
        }

        return {
            region: this.response.region,
            logGroup: this.response.logGroup,
            logStream: this.response.logStream,
        }
    }

    private readonly SELECT_STREAM: WizardStep = async () => {
        this.response.logStream = await this.context.pickLogStream()

        return undefined
    }
}
