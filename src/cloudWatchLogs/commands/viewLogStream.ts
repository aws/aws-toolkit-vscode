/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as moment from 'moment'
const localize = nls.loadMessageBundle()

import * as picker from '../../shared/ui/picker'
import { MultiStepWizard, WizardStep } from '../../shared/wizards/multiStepWizard'
import { LogGroupNode } from '../explorer/logGroupNode'
import { CloudWatchLogs } from 'aws-sdk'
import { ext } from '../../shared/extensionGlobals'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import * as telemetry from '../../shared/telemetry/telemetry'
import { LOCALIZED_DATE_FORMAT } from '../../shared/constants'
import { getPaginatedAwsCallIter } from '../../shared/utilities/collectionUtils'

export interface SelectLogStreamResponse {
    region: string
    logGroupName: string
    logStreamName: string
}

export async function viewLogStream(node: LogGroupNode): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
    const logStreamResponse = await new SelectLogStreamWizard(node).run()
    if (logStreamResponse) {
        vscode.window.showInformationMessage(
            `Not implemented but here's the deets:
region: ${logStreamResponse.region}
logGroup: ${logStreamResponse.logGroupName}
logStream: ${logStreamResponse.logStreamName}`
        )
    } else {
        result = 'Cancelled'
    }

    telemetry.recordCloudwatchlogsOpenStream({ result })
}

export interface SelectLogStreamWizardContext {
    pickLogStream(): Promise<string | undefined>
}

export class DefaultSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    public constructor(private readonly regionCode: string, private readonly logGroupName: string) {}

    public async pickLogStream(): Promise<string | undefined> {
        let telemetryResult: telemetry.Result = 'Succeeded'

        const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(this.regionCode)
        const logGroupName = this.logGroupName
        const qp = picker.createQuickPick({})
        const populator = new picker.IteratingQuickPickPopulator(
            () =>
                getPaginatedAwsCallIter({
                    awsCall: (request: CloudWatchLogs.DescribeLogStreamsRequest) => client.describeLogStreams(request),
                    nextTokenNames: {
                        request: 'nextToken',
                        response: 'nextToken',
                    },
                    request: {
                        logGroupName,
                        orderBy: 'LastEventTime',
                        descending: true,
                        limit: 1, // TODO: Remove debug val
                    },
                }),
            response => convertDescribeLogStreamsToQuickPickItems(response)
        )

        const controller = new picker.IteratingQuickPickController(qp, populator)
        controller.startRequests()
        const choices2 = await picker.promptUser({
            picker: qp,
            onDidTriggerButton: (button, resolve, reject) =>
                picker.iteratingOnDidTriggerButton(button, resolve, reject, controller),
        })

        const val = picker.verifySinglePickerOutput(choices2)

        let result = val?.label

        // handle no items for a group as a cancel
        // if (!result || result === quickPick.noItemsItem.label) {
        if (!result || result === picker.IteratingQuickPickController.NO_ITEMS_ITEM.label) {
            result = undefined
            telemetryResult = 'Cancelled'
        }
        // if (result === quickPick.errorItem.label) {
        if (result === picker.IteratingQuickPickController.ERROR_ITEM.label) {
            result = undefined
            telemetryResult = 'Failed'
        }

        telemetry.recordCloudwatchlogsOpenGroup({ result: telemetryResult })
        return result
    }
}

export function convertDescribeLogStreamsToQuickPickItems(
    response: CloudWatchLogs.DescribeLogStreamsResponse
): vscode.QuickPickItem[] {
    return (response.logStreams ?? []).map<vscode.QuickPickItem>(stream => ({
        label: stream.logStreamName!,
        detail: stream.lastEventTimestamp
            ? moment(stream.lastEventTimestamp).format(LOCALIZED_DATE_FORMAT)
            : localize('aws.cloudWatchLogs.viewLogStream.workflow.noStreams', '[No Log Events found]'),
    }))
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
