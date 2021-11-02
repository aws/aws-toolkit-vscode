/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { PromptResult } from '../../shared/ui/prompter'
import { IotClient } from '../../shared/clients/iotClient'
import { isValidResponse } from '../../shared/wizards/wizard'
import { IotCertWithPoliciesNode } from '../explorer/iotCertificateNode'
import { Iot } from 'aws-sdk'

export type policyGen = (
    iot: IotClient,
    window?: Window
) => AsyncGenerator<DataQuickPickItem<Iot.Policy>[], void, unknown>

/**
 * Attaches a policy to the certificate represented by the given node.
 *
 * Prompts the user to select a policy.
 * Attaches the policy.
 * Refreshes the certificate node.
 */
export async function attachPolicyCommand(
    node: IotCertWithPoliciesNode,
    promptFun = promptForPolicy,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('AttachPolicy called for %O', node)

    const certArn = node.certificate.arn

    const policy = await promptFun(node.iot, getPolicyList, window)
    if (!isValidResponse(policy)) {
        getLogger().info('No policy chosen')
        return undefined
    }
    getLogger().info('Picker returned: %O', policy)
    try {
        await node.iot.attachPolicy({ policyName: policy.policyName!, target: certArn })
    } catch (e) {
        getLogger().error(`Failed to attach policy ${policy.policyName}: %O`, e)
        showViewLogsMessage(
            localize('AWS.iot.attachCert.error', 'Failed to attach policy {0}', policy.policyName),
            window
        )
        return undefined
    }

    getLogger().debug('Attached policy %O', policy.policyName)

    //Refresh the certificate node
    await node.refreshNode(commands)
}

/**
 * Prompts the user to pick a policy to attach.
 */
async function promptForPolicy(
    iot: IotClient,
    policyFetch: policyGen,
    window?: Window
): Promise<PromptResult<Iot.Policy>> {
    const placeHolder: DataQuickPickItem<Iot.Policy> = {
        label: 'No policies found',
        data: undefined,
    }
    const picker = createQuickPick(policyFetch(iot, window), {
        title: localize('AWS.iot.attachPolicy', 'Select a policy'),
        noItemsFoundItem: placeHolder,
        buttons: [vscode.QuickInputButtons.Back],
    })
    return picker.prompt()
}

/**
 * Async generator function to get the list of policies when creating a quick pick.
 */
async function* getPolicyList(iot: IotClient, window?: Window) {
    let marker: string | undefined = undefined
    let filteredPolicies: Iot.Policy[]
    do {
        try {
            const policyResponse: Iot.ListPoliciesResponse = await iot.listPolicies({ marker })
            marker = policyResponse.nextMarker

            /* The policy name and arn should always be defined when using the
             * above API, but we filter here anyway for when we use ! later. */
            filteredPolicies = policyResponse.policies?.filter(policy => policy.policyArn && policy.policyName) ?? []
        } catch (e) {
            getLogger().error(`Failed to retrieve policies: %O`, e)
            showViewLogsMessage(localize('AWS.iot.attachPolicy.error', 'Failed to retrieve policies'), window)
            return
        }
        yield filteredPolicies.map(policy => ({ label: policy.policyName!, data: policy }))
    } while (marker != undefined)
}
