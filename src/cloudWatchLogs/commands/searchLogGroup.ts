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

import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import * as telemetry from '../../shared/telemetry/telemetry'
import { LOCALIZED_DATE_FORMAT } from '../../shared/constants'
import { getPaginatedAwsCallIter, IteratorTransformer } from '../../shared/utilities/collectionUtils'
import { CloudWatchAPIParameters, LogStreamRegistry } from '../registry/logStreamRegistry'
import { convertLogGroupInfoToUri } from '../cloudWatchLogsUtils'
import globals from '../../shared/extensionGlobals'
import { nodeModuleNameResolver } from 'typescript'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { isValidResponse } from '../../shared/wizards/wizard'

export interface SearchLogGroup {
    region: string
    logGroupName: string
}

export async function searchLogGroup(node: LogGroupNode, registry: LogStreamRegistry): Promise<void> {
    let result: telemetry.Result = 'Succeeded'

    const keywordSearchTerms = await vscode.window.showInputBox({
        placeHolder: 'Enter keyword search here.',
        prompt: 'Search for keyword among log group',
    })
    const strTimeOptions: string[] = ['1', '3', '6', '12', '24']
    const timeOptions: DataQuickPickItem<string>[] = []

    for (var timeOption of strTimeOptions) {
        timeOptions.push({
            label: timeOption + ' hour',
            data: timeOption,
            description: 'Search all logs within the past ' + timeOption + ' hour',
        })
    }
    timeOptions.push({
        label: 'All time',
        data: '0',
        description: 'Search all log events.',
    })

    const dateQuickPick = createQuickPick(timeOptions)
    const datetime = await dateQuickPick.prompt()
    const logGroupInfo = {
        groupName: node.name,
        regionName: node.regionCode,
    }

    const curTime = new Date().getTime()
    const timeToSubtract = Number(datetime) * 10 ** 6 * 3.6

    const filterParameters = {
        filterPattern: keywordSearchTerms ? keywordSearchTerms : '',
        startTime: datetime === '0' ? 0 : curTime - timeToSubtract,
    }
    const uri = convertLogGroupInfoToUri(node.name, node.regionCode, { filterParameters: filterParameters })
    await registry.registerLog(uri, logGroupInfo, filterParameters)
    //await registry.registerLogFilter(uri, filterParameters, logGroupInfo)
    const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
    vscode.languages.setTextDocumentLanguage(doc, 'log')
    await vscode.window.showTextDocument(doc, { preview: false })
    telemetry.recordCloudwatchlogsOpenStream({ result })
}

// export interface SelectLogStreamWizardContext {
//     pickLogStream(): Promise<string | undefined>
// }

// export class DefaultSelectLogStreamWizardContext implements SelectLogStreamWizardContext {
//     private readonly totalSteps = 1
//     public constructor(private readonly regionCode: string, private readonly logGroupName: string) {}

//     public async pickLogStream(): Promise<string | undefined> {
//         let telemetryResult: telemetry.Result = 'Succeeded'

//         const client: CloudWatchLogsClient = globals.toolkitClientBuilder.createCloudWatchLogsClient(this.regionCode)
//         const request: CloudWatchLogs.DescribeLogStreamsRequest = {
//             logGroupName: this.logGroupName,
//             orderBy: 'LastEventTime',
//             descending: true,
//         }
//         const qp = picker.createQuickPick({
//             options: {
//                 title: localize('AWS.cloudWatchLogs.viewLogStream.workflow.prompt', 'Select a log stream'),
//                 step: 1,
//                 totalSteps: this.totalSteps,
//             },
//         })
//         const populator = new IteratorTransformer(
//             () =>
//                 getPaginatedAwsCallIter({
//                     awsCall: request => client.describeLogStreams(request),
//                     nextTokenNames: {
//                         request: 'nextToken',
//                         response: 'nextToken',
//                     },
//                     request,
//                 }),
//             response => convertDescribeLogStreamsToQuickPickItems(response)
//         )

//         const controller = new picker.IteratingQuickPickController(qp, populator)
//         controller.startRequests()
//         const choices = await picker.promptUser({
//             picker: qp,
//             onDidTriggerButton: (button, resolve, reject) =>
//                 controller.iteratingOnDidTriggerButton(button, resolve, reject),
//         })

//         const val = picker.verifySinglePickerOutput(choices)

//         let result = val?.label

//         // handle no items for a group as a cancel
//         if (!result || result === picker.IteratingQuickPickController.NO_ITEMS_ITEM.label) {
//             result = undefined
//             telemetryResult = 'Cancelled'
//         }
//         // retry handled by caller -- should this be a "Failed"?
//         // of note: we don't track if an error pops up, we just track if the error is selected.
//         if (result === picker.IteratingQuickPickController.ERROR_ITEM.label) {
//             telemetryResult = 'Failed'
//         }

//         telemetry.recordCloudwatchlogsOpenGroup({ result: telemetryResult })
//         return result
//     }
// }

// export function convertDescribeLogStreamsToQuickPickItems(
//     response: CloudWatchLogs.DescribeLogStreamsResponse
// ): vscode.QuickPickItem[] {
//     return (response.logStreams ?? []).map<vscode.QuickPickItem>(stream => ({
//         label: stream.logStreamName!,
//         detail: stream.lastEventTimestamp
//             ? moment(stream.lastEventTimestamp).format(LOCALIZED_DATE_FORMAT)
//             : localize('AWS.cloudWatchLogs.viewLogStream.workflow.noStreams', '[No Log Events found]'),
//     }))
// }

// export class SelectLogStreamWizard extends MultiStepWizard<SearchLogGroup> {
//     private readonly response: Partial<SearchLogGroup>

//     public constructor(
//         node: LogGroupNode,
//         private readonly context: SelectLogStreamWizardContext = new DefaultSelectLogStreamWizardContext(
//             node.regionCode,
//             node.logGroup.logGroupName!
//         )
//     ) {
//         super()
//         this.response = {
//             region: node.regionCode,
//             logGroupName: node.logGroup.logGroupName,
//         }
//     }

//     protected get startStep(): WizardStep {
//         return this.SELECT_STREAM
//     }

//     protected getResult(): SearchLogGroup | undefined {
//         if (!this.response.region || !this.response.logGroupName) {
//             return undefined
//         }

//         return {
//             region: this.response.region,
//             logGroupName: this.response.logGroupName,
//         }
//     }

//     private readonly SELECT_STREAM: WizardStep = async () => {
//         const returnVal = await this.context.pickLogStream()

//         // retry on error
//         if (returnVal === picker.IteratingQuickPickController.ERROR_ITEM.label) {
//             return WIZARD_RETRY
//         }

//         return WIZARD_TERMINATE
//     }
// }
