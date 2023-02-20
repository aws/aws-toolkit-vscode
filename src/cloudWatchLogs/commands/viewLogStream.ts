/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as moment from 'moment'
import * as picker from '../../shared/ui/picker'
import { MultiStepWizard, WIZARD_RETRY, WIZARD_TERMINATE, WizardStep } from '../../shared/wizards/multiStepWizard'
import { LogGroupNode } from '../explorer/logGroupNode'
import { CloudWatchLogs } from 'aws-sdk'

import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { LOCALIZED_DATE_FORMAT } from '../../shared/constants'
import { getPaginatedAwsCallIter, IteratorTransformer } from '../../shared/utilities/collectionUtils'
import {
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    LogDataRegistry,
    getLogEventsFromUriComponents as getLogEventsFromUri,
    initLogData as initLogData,
} from '../registry/logDataRegistry'
import { createURIFromArgs } from '../cloudWatchLogsUtils'
import { prepareDocument } from './searchLogGroup'
import { telemetry, Result } from '../../shared/telemetry/telemetry'

export interface SelectLogStreamResponse {
    region: string
    logGroupName: string
    logStreamName: string
}

export async function viewLogStream(node: LogGroupNode, registry: LogDataRegistry): Promise<void> {
    let result: Result = 'Succeeded'
    const logStreamResponse = await new SelectLogStreamWizard(node).run()
    if (!logStreamResponse) {
        telemetry.cloudwatchlogs_open.emit({
            result: 'Cancelled',
            cloudWatchResourceType: 'logStream',
            source: 'Explorer',
        })
        return
    }

    const logGroupInfo: CloudWatchLogsGroupInfo = {
        groupName: logStreamResponse.logGroupName,
        regionName: logStreamResponse.region,
        streamName: logStreamResponse.logStreamName,
    }

    const parameters: CloudWatchLogsParameters = {
        limit: registry.configuration.get('limit', 10000),
    }

    const uri = createURIFromArgs(logGroupInfo, parameters)

    const logData = initLogData(logGroupInfo, parameters, getLogEventsFromUri)

    result = await prepareDocument(uri, logData, registry)
    telemetry.cloudwatchlogs_open.emit({ result: result, cloudWatchResourceType: 'logStream', source: 'Explorer' })
}

export interface SelectLogStreamWizardContext {
    pickLogStream(): Promise<string | undefined>
}

export class DefaultSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    private readonly totalSteps = 1
    public constructor(private readonly regionCode: string, private readonly logGroupName: string) {}

    public async pickLogStream(): Promise<string | undefined> {
        let telemetryResult: Result = 'Succeeded'

        const client = new DefaultCloudWatchLogsClient(this.regionCode)
        const request: CloudWatchLogs.DescribeLogStreamsRequest = {
            logGroupName: this.logGroupName,
            orderBy: 'LastEventTime',
            descending: true,
        }
        const qp = picker.createQuickPick({
            options: {
                title: localize('AWS.cwl.viewLogStream.workflow.prompt', 'Select a log stream'),
                step: 1,
                totalSteps: this.totalSteps,
            },
        })
        const populator = new IteratorTransformer(
            () =>
                getPaginatedAwsCallIter({
                    awsCall: request => client.describeLogStreams(request),
                    nextTokenNames: {
                        request: 'nextToken',
                        response: 'nextToken',
                    },
                    request,
                }),
            response => convertDescribeLogToQuickPickItems(response)
        )

        const controller = new picker.IteratingQuickPickController(qp, populator)
        controller.startRequests()
        const choices = await picker.promptUser({
            picker: qp,
            onDidTriggerButton: (button, resolve, reject) =>
                controller.iteratingOnDidTriggerButton(button, resolve, reject),
        })

        const val = picker.verifySinglePickerOutput(choices)

        let result = val?.label

        // handle no items for a group as a cancel
        if (!result || result === picker.IteratingQuickPickController.NO_ITEMS_ITEM.label) {
            result = undefined
            telemetryResult = 'Cancelled'
        }
        // retry handled by caller -- should this be a "Failed"?
        // of note: we don't track if an error pops up, we just track if the error is selected.
        if (result === picker.IteratingQuickPickController.ERROR_ITEM.label) {
            telemetryResult = 'Failed'
        }

        telemetry.cloudwatchlogs_openGroup.emit({ result: telemetryResult })
        return result
    }
}

export function convertDescribeLogToQuickPickItems(
    response: CloudWatchLogs.DescribeLogStreamsResponse
): vscode.QuickPickItem[] {
    return (response.logStreams ?? []).map<vscode.QuickPickItem>(stream => ({
        label: stream.logStreamName!,
        detail: stream.lastEventTimestamp
            ? moment(stream.lastEventTimestamp).format(LOCALIZED_DATE_FORMAT)
            : localize('AWS.cwl.viewLogStream.workflow.noStreams', '[No Log Events found]'),
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
        return this.selectStream
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

    private readonly selectStream: WizardStep = async () => {
        const returnVal = await this.context.pickLogStream()

        // retry on error
        if (returnVal === picker.IteratingQuickPickController.ERROR_ITEM.label) {
            return WIZARD_RETRY
        }

        this.response.logStreamName = returnVal

        return WIZARD_TERMINATE
    }
}
