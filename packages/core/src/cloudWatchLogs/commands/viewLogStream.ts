/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as picker from '../../shared/ui/picker'
import { MultiStepWizard, WIZARD_RETRY, WIZARD_TERMINATE, WizardStep } from '../../shared/wizards/multiStepWizard'
import { LogGroupNode } from '../explorer/logGroupNode'
import { CloudWatchLogs } from 'aws-sdk'

import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { getPaginatedAwsCallIter, IteratorTransformer } from '../../shared/utilities/collectionUtils'
import {
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    LogDataRegistry,
    initLogData as initLogData,
    filterLogEventsFromUri,
} from '../registry/logDataRegistry'
import { createURIFromArgs } from '../cloudWatchLogsUtils'
import { prepareDocument, searchLogGroup } from './searchLogGroup'
import { telemetry, Result } from '../../shared/telemetry/telemetry'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { formatLocalized } from '../../shared/utilities/textUtilities'

export async function viewLogStream(node: LogGroupNode, registry: LogDataRegistry): Promise<void> {
    await telemetry.cloudwatchlogs_open.run(async span => {
        span.record({ cloudWatchResourceType: 'logStream', source: 'Explorer' })
        const r = await new SelectLogStreamWizard(node).run()
        if (r === undefined || r.kind === 'cancelled' || r.kind === 'failed') {
            throw new CancellationError('user')
        }

        if (r.kind === 'doSearchLogGroup') {
            return searchLogGroup(registry, 'LogStreamMenu', {
                regionName: node.regionCode,
                groupName: node.logGroup.logGroupName!,
            })
        }

        const logGroupInfo: CloudWatchLogsGroupInfo = {
            groupName: r.logGroupName,
            regionName: r.region,
            streamName: r.logStreamName,
        }

        const parameters: CloudWatchLogsParameters = {
            limit: registry.configuration.get('limit', 10000),
        }

        const uri = createURIFromArgs(logGroupInfo, parameters)
        const logData = initLogData(logGroupInfo, parameters, filterLogEventsFromUri)
        await prepareDocument(uri, logData, registry)
    })
}

/**
 * This represents the final user choice from the select log stream wizard.
 *
 * Why? This wizard has different kinds of results, and this is a simple way to
 * represent them.
 */
export type LogSearchChoice =
    | { kind: 'doSearchLogGroup' }
    | { kind: 'selectedLogStream'; logStreamName: string; logGroupName: string; region: string }
    | { kind: 'cancelled' }
    | { kind: 'failed' }

export interface SelectLogStreamWizardContext {
    pickLogStream(): Promise<LogSearchChoice>
}

export class DefaultSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    private readonly totalSteps = 1
    public constructor(private readonly regionCode: string, private readonly logGroupName: string) {}

    public async pickLogStream(): Promise<LogSearchChoice> {
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

        // Add item to top of quick pick which indicates user instead wants to do Search Log Group quickpick flow
        const searchLogGroupItems: vscode.QuickPickItem[] = [
            { label: 'Actions', kind: vscode.QuickPickItemKind.Separator },
            { label: 'Search Log Group', detail: 'Search all Log Streams in this Log Group' },
            { label: 'Log Streams', kind: vscode.QuickPickItemKind.Separator },
        ]

        qp.items = searchLogGroupItems.concat(qp.items)

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

        const result = val?.label

        // The possible results of this wizard are not binary, the following
        // returns an object representing the final result (along with any necessary data)
        return this.shouldSearchLogGroup(result) ?? this.getSelectedLogStream(result)
    }

    /**
     * Returns an object indicating the user wants to search the log groups,
     * otherwise undefined
     */
    shouldSearchLogGroup(quickPickResult?: string): (LogSearchChoice & { kind: 'doSearchLogGroup' }) | undefined {
        if (quickPickResult !== 'Search Log Group') {
            return undefined
        }

        return { kind: 'doSearchLogGroup' }
    }

    /**
     * Returns the result of the log stream selection process.
     *
     * It is possible nothing was selected, this will be indicated
     * by the return value.
     */
    getSelectedLogStream(result?: string): LogSearchChoice {
        let telemetryResult: Result = 'Succeeded'
        let choice: LogSearchChoice
        // handle no items for a group as a cancel
        if (!result || result === picker.IteratingQuickPickController.NO_ITEMS_ITEM.label) {
            choice = { kind: 'cancelled' }
            telemetryResult = 'Cancelled'
        }
        // retry handled by caller -- should this be a "Failed"?
        // of note: we don't track if an error pops up, we just track if the error is selected.
        else if (result === picker.IteratingQuickPickController.ERROR_ITEM.label) {
            choice = { kind: 'failed' }
            telemetryResult = 'Failed'
        } else {
            choice = {
                kind: 'selectedLogStream',
                logStreamName: result,
                region: this.regionCode,
                logGroupName: this.logGroupName,
            }
        }

        telemetry.cloudwatchlogs_openGroup.emit({ result: telemetryResult })
        return choice
    }
}

export function convertDescribeLogToQuickPickItems(
    response: CloudWatchLogs.DescribeLogStreamsResponse
): vscode.QuickPickItem[] {
    return (response.logStreams ?? []).map<vscode.QuickPickItem>(stream => ({
        label: stream.logStreamName!,
        detail: stream.lastEventTimestamp
            ? formatLocalized(new Date(stream.lastEventTimestamp))
            : localize('AWS.cwl.viewLogStream.workflow.noStreams', '[No Log Events found]'),
    }))
}

export class SelectLogStreamWizard extends MultiStepWizard<LogSearchChoice> {
    private response: LogSearchChoice = { kind: 'cancelled' }

    public constructor(
        node: LogGroupNode,
        private readonly context: SelectLogStreamWizardContext = new DefaultSelectLogStreamWizardContext(
            node.regionCode,
            node.logGroup.logGroupName!
        )
    ) {
        super()
    }

    protected get startStep(): WizardStep {
        return this.selectStream
    }

    protected getResult(): LogSearchChoice {
        return this.response
    }

    private readonly selectStream: WizardStep = async () => {
        this.response = await this.context.pickLogStream()
        if (this.response.kind === 'failed') {
            // retry on error
            return WIZARD_RETRY
        }
        return WIZARD_TERMINATE
    }
}
