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
    const logGroupNodes = await getLogGroupNodes(regionCode)
    const logGroup = await new SearchLogGroupWizard(logGroupNodes).run()
    console.log(logGroup)
    // console.log("here")
    // console.log(logGroup)

    telemetry.recordCloudwatchlogsOpenStream({ result })
}

function loadLogGroups(logGroups: AWSTreeNodeBase[]): DataQuickPickItem<string>[] {
    let options: DataQuickPickItem<string>[] = []
    let groupNode: AWSTreeNodeBase
    for (groupNode of logGroups) {
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

async function getLogGroupNodes(regionCode: string) {
    // How can I test this??
    const artificialNode = new CloudWatchLogsNode(regionCode)
    const logGroupNodes: AWSTreeNodeBase[] = await artificialNode.getChildren()
    return logGroupNodes
}

export function createLogGroupPrompter(logGroupNodes: AWSTreeNodeBase[]) {
    const logGroups = loadLogGroups(logGroupNodes)
    return createQuickPick(logGroups, {
        title: 'Select Log Group',
        placeholder: 'Enter text here',
    })
}

export class SearchLogGroupWizard extends Wizard<SearchLogGroupWizardResponse> {
    public constructor(logGroupNodes: AWSTreeNodeBase[]) {
        super()
        this.form.logGroup.bindPrompter(() => createLogGroupPrompter(logGroupNodes))
    }
}
