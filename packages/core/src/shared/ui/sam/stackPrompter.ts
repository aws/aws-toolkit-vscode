/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { StackSummary } from 'aws-sdk/clients/cloudformation'
import { getAwsConsoleUrl } from '../../awsConsole'
import { DefaultCloudFormationClient } from '../../clients/cloudFormationClient'
import * as vscode from 'vscode'
import { createCommonButtons } from '../buttons'
import { createQuickPick } from '../pickerPrompter'
import * as nls from 'vscode-nls'
import { getRecentResponse } from '../../sam/utils'

export const localize = nls.loadMessageBundle()

const canPickStack = (s: StackSummary) => s.StackStatus.endsWith('_COMPLETE')
const canShowStack = (s: StackSummary) =>
    (s.StackStatus.endsWith('_COMPLETE') || s.StackStatus.endsWith('_IN_PROGRESS')) && !s.StackStatus.includes('DELETE')

/**
 * Creates a quick pick prompter for choosing a CloudFormation stack
 * The promper supports selecting from existing options or creating a new stack by entering a name
 *
 * @param client - CloudFormation client to use for listing stacks
 * @param mementoRootKey - Key used to store/retrieve recently used stack (e.g 'samcli.deploy.params')
 * @param samCommandUrl  - URI for sam command wizard webpage
 * @returns A quick pick prompter configured for stack selection
 *
 */
export function createStackPrompter(
    client: DefaultCloudFormationClient,
    mementoRootKey: string,
    samCommandUrl: vscode.Uri
) {
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
        buttons: createCommonButtons(samCommandUrl, consoleUrl),
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
