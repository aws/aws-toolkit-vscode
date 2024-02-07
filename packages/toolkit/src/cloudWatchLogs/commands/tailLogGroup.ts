/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import {
    CloudWatchLogsGroupInfo,
    LogDataRegistry,
    filterLogEventsFromUri,
    CloudWatchLogsParameters,
} from '../registry/logDataRegistry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { isValidResponse, isWizardControl, Wizard, WIZARD_RETRY } from '../../shared/wizards/wizard'
import { createURIFromArgs, msgKey } from '../cloudWatchLogsUtils'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { getLogger } from '../../shared/logger'
import { TimeFilterResponse, TimeFilterSubmenu } from '../timeFilterSubmenu'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogsClient, StartLiveTailCommand, StartLiveTailCommandOutput } from '@aws-sdk/client-cloudwatch-logs'
import { ExtendedInputBoxOptions, InputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { RegionSubmenu, RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'
import { truncate } from '../../shared/utilities/textUtilities'
import { createBackButton, createExitButton, createHelpButton } from '../../shared/ui/buttons'
import { PromptResult } from '../../shared/ui/prompter'
import { ToolkitError } from '../../shared/errors'
import { Messages } from '../../shared/utilities/messages'

const localize = nls.loadMessageBundle()

// function handleWizardResponse(response: TailLogGroupWizardResponse, registry: LogDataRegistry): CloudWatchLogsData {
//     const logGroupInfo: CloudWatchLogsGroupInfo = {
//         groupName: response.submenuResponse.data,
//         regionName: response.submenuResponse.region,
//     }
//     let parameters: CloudWatchLogsParameters

//     if (response.timeRange.start === response.timeRange.end) {
//         // this means no time filter.
//         parameters = {
//             limit: limitParam,
//             filterPattern: response.filterPattern,
//         }
//     } else {
//         parameters = {
//             limit: limitParam,
//             filterPattern: response.filterPattern,
//             startTime: response.timeRange.start,
//             endTime: response.timeRange.end,
//         }
//     }

//     return logData
// }

export async function prepareDocument(uri: vscode.Uri) {
    try {
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { preview: false })
        await vscode.languages.setTextDocumentLanguage(doc, 'log')
    } catch (err) {
        if (CancellationError.isUserCancelled(err)) {
            throw err
        }

        throw ToolkitError.chain(
            err,
            localize('AWS.cwl.searchLogGroup.errorRetrievingLogs', 'Failed to get logs for {0}', uri.toString())
        )
    }
}

// /**
//  * "Search Log Group" command
//  *
//  * @param registry
//  * @param source Telemetry "source" name
//  * @param logData
//  */
// export async function searchLogGroup(
//     registry: LogDataRegistry,
//     source: string,
//     logData?: { regionName: string; groupName: string }
// ): Promise<void> {
//     await telemetry.cloudwatchlogs_open.run(async span => {
//         const wizard = new SearchLogGroupWizard(logData)
//         span.record({ cloudWatchResourceType: 'logGroup', source: source })
//         const response = await wizard.run()
//         if (!response) {
//             throw new CancellationError('user')
//         }

//         const userResponse = handleWizardResponse(response, registry)
//         const uri = createURIFromArgs(userResponse.logGroupInfo, userResponse.parameters)
//         await prepareDocument(uri, userResponse, registry)
//     })
// }

export async function tailLogGroup(
    registry: LogDataRegistry,
    source: string,
    logData?: { regionName: string; groupName: string; groupArn: string }
) {
    const wizard = new TailLogGroupWizard(logData)
    const response = await wizard.run()
    if (!response) {
        throw new CancellationError('user')
    }
    const logGroupInfo: CloudWatchLogsGroupInfo = {
        groupName: response.submenuResponse.data,
        regionName: response.submenuResponse.region,
    }
    const uri = createURIFromArgs(logGroupInfo, {})
    await prepareDocument(uri)

    const client = new CloudWatchLogsClient({ region: logGroupInfo.regionName })

    const command = new StartLiveTailCommand({
        logGroupIdentifiers: [formatGroupArn(logData?.groupArn!)],
    })

    try {
        const response = await client.send(command)
        handleResponseAsync(response, uri)
    } catch (err) {
        // Pre-stream exceptions are captured here
        console.log(err)
    }
}

function formatGroupArn(groupArn: string): string {
    return groupArn.endsWith(':*') ? groupArn.substring(0, groupArn.length - 2) : groupArn
}

export async function handleResponseAsync(response: StartLiveTailCommandOutput, uri: vscode.Uri) {
    try {
        let lineNum = 0
        for await (const event of response.responseStream!) {
            const edit = new vscode.WorkspaceEdit()
            if (event.sessionStart !== undefined) {
                console.log(event.sessionStart)
            } else if (event.sessionUpdate !== undefined) {
                for (const logEvent of event.sessionUpdate.sessionResults!) {
                    const date = new Date(logEvent.timestamp!)
                    console.log('[' + date + '] ')
                    edit.insert(uri, new vscode.Position(lineNum, 0), '[' + date + '] ' + logEvent.message + '\n')
                    lineNum += 1
                }
            } else {
                console.error('Unknown event type')
            }
            vscode.workspace.applyEdit(edit)
        }
    } catch (err) {
        // On-stream exceptions are captured here
        console.error(err)
    }
}

async function getLogGroupsFromRegion(regionCode: string): Promise<DataQuickPickItem<string>[]> {
    const client = new DefaultCloudWatchLogsClient(regionCode)
    const logGroups = await logGroupsToArray(client.describeLogGroups())
    const options = logGroups.map<DataQuickPickItem<string>>(logGroupString => ({
        label: logGroupString,
        data: logGroupString,
    }))
    return options
}

async function logGroupsToArray(logGroups: AsyncIterableIterator<CloudWatchLogs.LogGroup>): Promise<string[]> {
    const logGroupsArray = []
    for await (const logGroupObject of logGroups) {
        logGroupObject.logGroupName && logGroupsArray.push(logGroupObject.logGroupName)
    }
    return logGroupsArray
}

/**
 * HACK: this subclass overrides promptUser() so that we can validate the
 * search pattern against the service and if it fails, keep the prompt displayed.
 *
 * This is necessary until vscode's inputbox.onDidAccept() awaits async callbacks:
 *    - https://github.com/aws/aws-toolkit-vscode/pull/3114#discussion_r1085484630
 *    - https://github.com/microsoft/vscode/blob/78947444843f4ebb094e5ab4288360010a293463/extensions/git-base/src/remoteSource.ts#L13
 *    - https://github.com/microsoft/vscode/blob/78947444843f4ebb094e5ab4288360010a293463/src/vs/base/browser/ui/inputbox/inputBox.ts#L511
 */
export class SearchPatternPrompter extends InputBoxPrompter {
    constructor(
        public logGroup: CloudWatchLogsGroupInfo,
        public logParams: CloudWatchLogsParameters,
        /** HACK: also maintain ad-hoc state because `wizardState` is not mutable. */
        public readonly retryState: any,
        public override readonly inputBox: InputBox,
        protected override readonly options: ExtendedInputBoxOptions = {},
        private noValidate: boolean
    ) {
        super(inputBox, options)
        this.inputBox.validationMessage = retryState.validationMessage ? retryState.validationMessage : undefined
        if (this.retryState.searchPattern) {
            this.inputBox.value = this.retryState.searchPattern
        }
        this.inputBox.onDidChangeValue(val => {
            this.inputBox.validationMessage = undefined
        })
    }

    protected override async promptUser(): Promise<PromptResult<string>> {
        const rv = await super.promptUser()
        this.inputBox.busy = true
        try {
            if (isWizardControl(rv)) {
                return rv
            }

            const validationResult = await this.validateSearchPattern(this.inputBox.value, this.noValidate)
            // HACK: maintain our own state and restore it.
            this.retryState.searchPattern = isValidResponse(rv) ? rv : undefined
            this.retryState.validationMessage = validationResult

            if (validationResult !== undefined) {
                return WIZARD_RETRY
            }
            return this.inputBox.value
        } finally {
            this.inputBox.busy = false
        }
    }

    async validateSearchPattern(searchPattern: string, noValidate: boolean): Promise<string | undefined> {
        if (noValidate) {
            return undefined // Skip validation (service call) in tests.
        }
        getLogger().debug('cwl: validateSearchPattern: %O', searchPattern)
        try {
            await filterLogEventsFromUri(
                this.logGroup,
                {
                    ...this.logParams,
                    filterPattern: searchPattern,
                    limit: 1,
                },
                undefined,
                false
            )
        } catch (e) {
            // Validation error. Get the progress message from the global map and cancel it.
            const msgTimeout = await Messages.putMessage(msgKey(this.logGroup), '')
            msgTimeout.cancel()

            return (e as Error).message
        }
        return undefined
    }
}

/**
 * Prompts the user for a search query, and validates it.
 *
 * @param noValidate For testing only: disable validation (which does a service call).
 */
export function createSearchPatternPrompter(
    logGroup: CloudWatchLogsGroupInfo,
    logParams: CloudWatchLogsParameters,
    retryState: any,
    isFirst: boolean,
    noValidate: boolean
): SearchPatternPrompter {
    const helpUri =
        'https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html#matching-terms-events'
    const titleText = localize(
        'AWS.cwl.searchLogGroup.filterPatternTitle',
        `Search Log Group {0}`,
        truncate(logGroup.groupName, -50)
    )
    const placeHolderText = localize(
        'AWS.cwl.searchLogGroup.filterPatternPlaceholder',
        'search pattern (case sensitive; empty matches all)'
    )

    const options = {
        title: titleText,
        placeholder: placeHolderText,
        buttons: [createHelpButton(helpUri), createExitButton()],
    }

    if (!isFirst) {
        options.buttons = [...options.buttons, createBackButton()]
    }

    const inputBox = vscode.window.createInputBox() as InputBox
    // assign({ ...defaultInputboxOptions, ...options }, inputBox)
    inputBox.title = titleText
    inputBox.placeholder = placeHolderText
    inputBox.buttons = options.buttons
    const prompter = new SearchPatternPrompter(logGroup, logParams, retryState, inputBox, {}, noValidate)
    return prompter
}

export function createRegionSubmenu() {
    return new RegionSubmenu(
        getLogGroupsFromRegion,
        { title: localize('AWS.cwl.searchLogGroup.logGroupPromptTitle', 'Select Log Group') },
        { title: localize('AWS.cwl.searchLogGroup.regionPromptTitle', 'Select Region for Log Group') },
        'Log Groups'
    )
}

export interface TailLogGroupWizardResponse {
    submenuResponse: RegionSubmenuResponse<string>
    filterPattern: string
    timeRange: TimeFilterResponse
}

export class TailLogGroupWizard extends Wizard<TailLogGroupWizardResponse> {
    /** HACK: maintain our own state and restore it because WizardState is not mutable. */
    private retryState: any = {}

    public constructor(logGroupInfo?: CloudWatchLogsGroupInfo) {
        super({
            initState: {
                submenuResponse: logGroupInfo
                    ? {
                          data: logGroupInfo.groupName,
                          region: logGroupInfo.regionName,
                      }
                    : undefined,
            },
        })

        this.form.submenuResponse.bindPrompter(createRegionSubmenu)
        this.form.timeRange.bindPrompter(() => new TimeFilterSubmenu())
        this.form.filterPattern.bindPrompter(state => {
            if (!state.submenuResponse) {
                throw Error('state.submenuResponse is null')
            }
            return createSearchPatternPrompter(
                {
                    groupName: state.submenuResponse.data,
                    regionName: state.submenuResponse.region,
                },
                {
                    startTime: state.timeRange?.start,
                    endTime: state.timeRange?.end,
                    filterPattern: undefined,
                },
                this.retryState,
                logGroupInfo ? true : false,
                false
            )
        })
    }
}
