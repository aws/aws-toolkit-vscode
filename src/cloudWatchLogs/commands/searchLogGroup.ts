/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { nodeModuleNameResolver } from 'typescript'
import * as nls from 'vscode-nls'
import { CloudWatchLogsClient, DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import * as telemetry from '../../shared/telemetry/telemetry'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import {
    CloudWatchLogsData,
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    LogStreamRegistry,
    getLogEventsFromUriComponents,
} from '../registry/logStreamRegistry'
import { CloudWatchLogsNode } from '../../../src/cloudWatchLogs/explorer/cloudWatchLogsNode'
import { CloudWatchLogs } from 'aws-sdk'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'

import { Wizard } from '../../shared/wizards/wizard'

export async function searchLogGroup(registry: LogStreamRegistry): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
    const regionCode = 'us-west-2'
    const logGroup = await new SearchLogGroupWizard(regionCode).run()
    console.log(logGroup)
    // console.log("here")
    // console.log(logGroup)

    telemetry.recordCloudwatchlogsOpenStream({ result })
}

async function loadLogGroups(logGroups: Promise<AWSTreeNodeBase[]>): Promise<DataQuickPickItem<string>[]> {
    let options: DataQuickPickItem<string>[] = []
    let groupNode: AWSTreeNodeBase
    for (groupNode of await logGroups) {
        if (groupNode.label) {
            options.push({
                label: groupNode.label,
                data: groupNode.label,
            })
        } else {
            // Not sure if this can/should ever happen, but put error message in case.
            throw new Error('Recieved Log Group in searchLogGroup Wizard without a label.')
        }
    }

    return options
}

export interface SearchLogGroupWizardResponse {
    logGroup: string
}

function createLogGroupPrompter(regionCode: string) {
    const artificialNode = new CloudWatchLogsNode(regionCode)
    const logGroupsPromise: Promise<AWSTreeNodeBase[]> = artificialNode.getChildren()
    const logGroups = loadLogGroups(logGroupsPromise)
    return createQuickPick(logGroups)
}

export class SearchLogGroupWizard extends Wizard<SearchLogGroupWizardResponse> {
    public constructor(regionCode: string) {
        super()
        this.form.logGroup.bindPrompter(() => createLogGroupPrompter(regionCode))
    }
}
