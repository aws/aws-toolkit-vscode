/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { StackSummary } from 'aws-sdk/clients/cloudformation'
import { getAwsConsoleUrl } from '../../awsConsole'
import { DefaultCloudFormationClient } from '../../clients/cloudFormationClient'
import { samSyncUrl } from '../../constants'
import { createCommonButtons } from '../buttons'
import { createQuickPick } from '../pickerPrompter'
import * as nls from 'vscode-nls'
import { getRecentResponse } from '../../sam/utils'

export const localize = nls.loadMessageBundle()

const canPickStack = (s: StackSummary) => s.StackStatus.endsWith('_COMPLETE')
const canShowStack = (s: StackSummary) =>
    (s.StackStatus.endsWith('_COMPLETE') || s.StackStatus.endsWith('_IN_PROGRESS')) && !s.StackStatus.includes('DELETE')

export function createStackPrompter(client: DefaultCloudFormationClient, mementoRootKey: string) {
    const recentStack = getRecentResponse(mementoRootKey, client.regionCode, 'stackName')
    const consoleUrl = getAwsConsoleUrl('cloudformation', client.regionCode)
    const items = client.listAllStacks().map((stacks) =>
        stacks.filter(canShowStack).map((s) => ({
            label: s.StackName,
            data: s.StackName,
            invalidSelection: !canPickStack(s),
            recentlyUsed: s.StackName === recentStack,
            description: !canPickStack(s) ? 'stack create/update already in progress' : undefined,
        }))
    )

    return createQuickPick(items, {
        title: 'Select a CloudFormation Stack',
        placeholder: 'Select a stack (or enter a name to create one)',
        filterBoxInputSettings: {
            label: 'Create a New Stack',
            transform: (v) => v,
        },
        buttons: createCommonButtons(samSyncUrl, consoleUrl),
        noItemsFoundItem: {
            label: localize(
                'aws.cfn.noStacks',
                'No stacks in region "{0}". Enter a name to create a new one.',
                client.regionCode
            ),
            data: undefined,
            onClick: undefined,
        },
    })
}
