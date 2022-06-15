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
import { CloudWatchAPIParameters, CloudWatchLogsGroupInfo, LogStreamRegistry } from '../registry/logStreamRegistry'
import { convertLogGroupInfoToUri } from '../cloudWatchLogsUtils'
import globals from '../../shared/extensionGlobals'
import { nodeModuleNameResolver } from 'typescript'
import { createQuickPick, DataQuickPickItem, QuickPickPrompter } from '../../shared/ui/pickerPrompter'
import { isValidResponse, WIZARD_BACK } from '../../shared/wizards/wizard'
import { Wizard } from '../../shared/wizards/wizard'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { integer } from 'vscode-languageserver-types'
import { CloudWatchLogsNode } from '../explorer/cloudWatchLogsNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AwsContext } from '../../shared/awsContext'

export interface SearchLogGroup {
    region: string
    logGroupName: string
}

export async function searchLogGroup(
    AWSContext: AwsContext,
    registry: LogStreamRegistry,
    node?: LogGroupNode
): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
    const regionOptions = await AWSContext.getExplorerRegions()
    const defaultRegion = await AWSContext.getCredentialDefaultRegion()
    const filterParameters = await new SearchLogGroupWizard(node, regionOptions, defaultRegion).run()

    // If no input is given, skip over?
    // TODO: Most likely better option here.
    if (!filterParameters) {
        return
    }
    const logGroupName = node ? node.name : filterParameters.logGroup
    // const regionCode = node ? node.regionCode : filterParameters.regionCode

    if (filterParameters.startTime !== 0) {
        filterParameters.startTime = makeTimeAbsolute(filterParameters)
    }

    const logGroupInfo = {
        groupName: logGroupName,
        regionName: filterParameters.regionCode,
    }

    const uri = convertLogGroupInfoToUri('filterLogEvents', logGroupInfo.groupName, logGroupInfo.regionName, {
        filterParameters: filterParameters,
    })
    console.log(logGroupInfo)
    await registry.registerLog(uri, logGroupInfo, filterParameters)
    //await registry.registerLogFilter(uri, filterParameters, logGroupInfo)
    const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
    vscode.languages.setTextDocumentLanguage(doc, 'log')
    await vscode.window.showTextDocument(doc, { preview: false })
    telemetry.recordCloudwatchlogsOpenStream({ result })
}

function makeTimeAbsolute(filterParameters: CloudWatchAPIParameters) {
    const curTime = new Date().getTime()
    const timeToSubtract = Number(filterParameters.startTime) * 10 ** 6 * 3.6
    return curTime - timeToSubtract
}

function createKeywordPrompter() {
    return createInputBox({
        title: 'keyword search',
        placeholder: 'Enter keyword search here',
    })
}

function createDatetimePrompter() {
    // TODO: Make it so this doesn't have to be run everytime a user wants to search something.
    const strTimeOptions: integer[] = [1, 3, 6, 12, 24]
    const timeOptions: DataQuickPickItem<integer>[] = []

    for (var timeOption of strTimeOptions) {
        timeOptions.push({
            label: timeOption + ' hour',
            data: timeOption,
            description: 'Search all logs within the past ' + timeOption + ' hour',
        })
    }

    timeOptions.push({
        label: 'All time',
        data: 0,
        description: 'Search all log events.',
    })

    return createQuickPick(timeOptions)
}

function createLogGroupPrompter(regionCode: string) {
    const logGroups = getLogGroupsFromRegion(regionCode)

    const options: Promise<DataQuickPickItem<string>[]> = loadLogGroups([], logGroups)
    return createQuickPick(options)
}

function createRegionPrompter(regionOptions: Array<string>) {
    let quickPickOptions: DataQuickPickItem<string>[] = []
    for (var option of regionOptions) {
        quickPickOptions.push({
            label: option,
            data: option,
        })
    }

    return createQuickPick(quickPickOptions)
}

export interface SearchLogGroupWizardResponse {
    filterPattern: string
    startTime: number
    logGroup: string
    regionCode: string
}

async function loadLogGroups(options: DataQuickPickItem<string>[], logGroups: Promise<AWSTreeNodeBase[]>) {
    const logGroupsResult = await logGroups
    let logGroup
    for (logGroup of logGroupsResult) {
        if (logGroup.label) {
            options.push({
                label: logGroup.label,
                data: logGroup.label,
            })
        }
    }
    return options
}

async function getLogGroupsFromRegion(region: string) {
    const node = new CloudWatchLogsNode(region)
    const logGroups: AWSTreeNodeBase[] = await node.getChildren()
    return logGroups
}

export class SearchLogGroupWizard extends Wizard<SearchLogGroupWizardResponse> {
    public constructor(node: LogGroupNode | undefined, regionOptions: Array<string>, defaultRegion: string) {
        super()
        // If we don't get a node, we aren't working in the explorer => We must select region + log group by hand.
        if (!node) {
            // If they only have a single region on their explorer, default to that one.
            // Otherwise default to the one that is linked with their account.

            this.form.regionCode.setDefault(regionOptions.length === 1 ? regionOptions[0] : defaultRegion)
            this.form.regionCode.bindPrompter(() => createRegionPrompter(regionOptions), {
                showWhen: () => regionOptions.length !== 1,
            })
            this.form.logGroup.bindPrompter(({ regionCode }) => createLogGroupPrompter(regionCode!))
        } else {
            this.form.logGroup.setDefault(node.name)
            this.form.regionCode.setDefault(node.regionCode)
        }
        this.form.filterPattern.bindPrompter(createKeywordPrompter)
        this.form.startTime.bindPrompter(createDatetimePrompter)
    }
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
