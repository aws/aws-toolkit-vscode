/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import globals from '../../../shared/extensionGlobals'
import { ToolkitError } from '../../../shared/errors'
import { DefaultCloudWatchLogsClient } from '../../../shared/clients/cloudWatchLogsClient'
import { cwlFilterPatternHelpUrl } from '../../../shared/constants'
import { createBackButton, createExitButton, createHelpButton } from '../../../shared/ui/buttons'
import { RegionSubmenu, RegionSubmenuResponse } from '../../../shared/ui/common/regionSubmenu'
import { createInputBox } from '../../../shared/ui/inputPrompter'
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import { Wizard } from '../../../shared/wizards/wizard'
import { CloudWatchLogsGroupInfo } from '../registry/logDataRegistry'
import { LogStreamFilterResponse, LogStreamFilterSubmenu } from './liveTailLogStreamSubmenu'

const localize = nls.loadMessageBundle()

export interface TailLogGroupWizardResponse {
    regionLogGroupSubmenuResponse: RegionSubmenuResponse<string>
    logStreamFilter: LogStreamFilterResponse
    filterPattern: string
}

export class TailLogGroupWizard extends Wizard<TailLogGroupWizardResponse> {
    public constructor(logGroupInfo?: CloudWatchLogsGroupInfo, logStreamInfo?: LogStreamFilterResponse) {
        super({
            initState: {
                regionLogGroupSubmenuResponse: logGroupInfo
                    ? {
                          data: buildLogGroupArn(logGroupInfo.groupName, logGroupInfo.regionName),
                          region: logGroupInfo.regionName,
                      }
                    : undefined,
                logStreamFilter: logStreamInfo ?? undefined,
            },
        })
        this.form.regionLogGroupSubmenuResponse.bindPrompter(createRegionLogGroupSubmenu)
        this.form.logStreamFilter.bindPrompter((state) => {
            if (!state.regionLogGroupSubmenuResponse?.data) {
                throw new ToolkitError('Log Group name is null')
            }
            return new LogStreamFilterSubmenu(
                state.regionLogGroupSubmenuResponse.data,
                state.regionLogGroupSubmenuResponse.region
            )
        })
        this.form.filterPattern.bindPrompter((state) => createFilterPatternPrompter())
    }
}

export function createRegionLogGroupSubmenu(): RegionSubmenu<string> {
    return new RegionSubmenu(
        getLogGroupQuickPickOptions,
        {
            title: localize('AWS.cwl.tailLogGroup.logGroupPromptTitle', 'Select Log Group to tail'),
            buttons: [createExitButton()],
        },
        { title: localize('AWS.cwl.tailLogGroup.regionPromptTitle', 'Select Region for Log Group') },
        'Log Groups'
    )
}

async function getLogGroupQuickPickOptions(regionCode: string): Promise<DataQuickPickItem<string>[]> {
    const client = new DefaultCloudWatchLogsClient(regionCode)
    const logGroups = client.describeLogGroups()

    const logGroupsOptions: DataQuickPickItem<string>[] = []

    for await (const logGroupObject of logGroups) {
        if (!logGroupObject.arn || !logGroupObject.logGroupName) {
            throw new ToolkitError('Log Group name or arn is undefined')
        }

        logGroupsOptions.push({
            label: logGroupObject.logGroupName,
            data: formatLogGroupArn(logGroupObject.arn),
        })
    }

    return logGroupsOptions
}

export function buildLogGroupArn(logGroupName: string, region: string): string {
    if (logGroupName.startsWith('arn:')) {
        return logGroupName
    }
    const awsAccountId = globals.awsContext.getCredentialAccountId()
    if (awsAccountId === undefined) {
        throw new ToolkitError(
            `Failed to construct Arn for Log Group because awsAccountId is undefined. Log Group: ${logGroupName}`
        )
    }
    return `arn:aws:logs:${region}:${awsAccountId}:log-group:${logGroupName}`
}

function formatLogGroupArn(logGroupArn: string): string {
    return logGroupArn.endsWith(':*') ? logGroupArn.substring(0, logGroupArn.length - 2) : logGroupArn
}

export function createFilterPatternPrompter() {
    const helpUri = cwlFilterPatternHelpUrl
    return createInputBox({
        title: 'Provide log event filter pattern',
        placeholder: 'filter pattern (case sensitive; empty matches all)',
        prompt: 'Optional filter to include only log events that match the supplied pattern.',
        buttons: [createHelpButton(helpUri), createBackButton(), createExitButton()],
    })
}
