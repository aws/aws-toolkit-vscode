/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import * as moment from 'moment'
import { LogGroupNode } from '../explorer/logGroupNode'
import { CloudWatchLogs } from 'aws-sdk'
import { ext } from '../../shared/extensionGlobals'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import * as telemetry from '../../shared/telemetry/telemetry'
import { LOCALIZED_DATE_FORMAT } from '../../shared/constants'
import { getPaginatedAwsCallIter, IteratorTransformer } from '../../shared/utilities/collectionUtils'
import { LogStreamRegistry } from '../registry/logStreamRegistry'
import { convertLogGroupInfoToUri } from '../cloudWatchLogsUtils'
import { Prompter } from '../../shared/ui/prompter'
import { initializeInterface } from '../../shared/transformers'
import { Wizard, WIZARD_BACK, WIZARD_RETRY } from '../../shared/wizards/wizard'
import { IteratingQuickPickController } from '../../shared/ui/iteratingPicker'
import { QuickPickPrompter, DataQuickPick, createLabelQuickPick, LabelQuickPickItem} from '../../shared/ui/picker'

export interface SelectLogStreamResponse {
    region: string
    logGroupName: string
    logStreamName: string
}

export async function viewLogStream(node: LogGroupNode, registry: LogStreamRegistry): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
    const logStreamResponse = await new SelectLogStreamWizard(node).run()
    if (logStreamResponse) {
        const uri = convertLogGroupInfoToUri(
            logStreamResponse.logGroupName!,
            logStreamResponse.logStreamName!,
            logStreamResponse.region!
        )
        await registry.registerLog(uri)
        const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
        vscode.languages.setTextDocumentLanguage(doc, 'log')
        await vscode.window.showTextDocument(doc, { preview: false })
    } else {
        result = 'Cancelled'
    }

    telemetry.recordCloudwatchlogsOpenStream({ result })
}

export interface SelectLogStreamWizardContext {
    createLogStreamPrompter(): Prompter<string>
}

export class DefaultSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
    public constructor(private readonly regionCode: string, private readonly logGroupName: string) {}

    public createLogStreamPrompter(): QuickPickPrompter<string> {
        let telemetryResult: telemetry.Result = 'Succeeded'

        const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(this.regionCode)
        const request: CloudWatchLogs.DescribeLogStreamsRequest = {
            logGroupName: this.logGroupName,
            orderBy: 'LastEventTime',
            descending: true,
        }
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
            response => convertDescribeLogStreamsToQuickPickItems(response)
        )

        const prompter = createLabelQuickPick<string>([], 
            { title: localize('aws.cloudWatchLogs.viewLogStream.workflow.prompt', 'Select a log stream')}
        )

        const controller = new IteratingQuickPickController(prompter.quickInput as DataQuickPick<string>, populator)
        controller.startRequests()

        prompter.after(async result => {
            try {
                if (result ===  IteratingQuickPickController.NO_ITEMS_ITEM.label) {
                    telemetryResult = 'Cancelled'
                    return WIZARD_BACK
                } else if (result === IteratingQuickPickController.ERROR_ITEM.label) {
                    telemetryResult = 'Failed'
                    return WIZARD_RETRY
                }
            } finally {
                telemetry.recordCloudwatchlogsOpenGroup({ result: telemetryResult })
            }
        })

        return prompter
    }
}

export function convertDescribeLogStreamsToQuickPickItems(
    response: CloudWatchLogs.DescribeLogStreamsResponse
): LabelQuickPickItem<string>[] {
    return (response.logStreams ?? []).map<LabelQuickPickItem<string>>(stream => ({
        label: stream.logStreamName!,
        detail: stream.lastEventTimestamp
            ? moment(stream.lastEventTimestamp).format(LOCALIZED_DATE_FORMAT)
            : localize('aws.cloudWatchLogs.viewLogStream.workflow.noStreams', '[No Log Events found]'),
    }))
}

export class SelectLogStreamWizard extends Wizard<Partial<SelectLogStreamResponse>> {
    public constructor(
        node: LogGroupNode,
        context: SelectLogStreamWizardContext = new DefaultSelectLogStreamWizardContext(
            node.regionCode,
            node.logGroup.logGroupName!
        )
    ) {
        super(
            initializeInterface<SelectLogStreamResponse>(), 
            { region: node.regionCode, logGroupName: node.logGroup.logGroupName! }
        )
        this.form.logStreamName.bindPrompter(form => context.createLogStreamPrompter())
    }
}
