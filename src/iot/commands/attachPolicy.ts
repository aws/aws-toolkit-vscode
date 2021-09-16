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
import { DefaultIotPolicy, IotPolicy } from '../../shared/clients/iotClient'
import { WizardControl } from '../../shared/wizards/wizard'
import { IotCertWithPoliciesNode } from '../explorer/iotCertificateNode'
import { Iot } from 'aws-sdk'

/**
 * Attaches a policy to the certificate represented by the given node.
 *
 * Prompts the user to select a policy.
 * Attaches the policy.
 * Refreshes the certificate node.
 */
export async function attachPolicyCommand(
    node: IotCertWithPoliciesNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('AttachPolicy called for %O', node)

    const certArn = node.certificate.arn

    let nextToken: string | undefined = undefined
    let policies: IotPolicy[] = []
    do {
        try {
            const policyResponse: Iot.ListPoliciesResponse = await node.iot.listPolicies({ marker: nextToken })
            nextToken = policyResponse.nextMarker

            const newPolicies =
                policyResponse.policies
                    ?.filter(policy => policy.policyArn && policy.policyName)
                    .map(policy => new DefaultIotPolicy({ arn: policy.policyArn!, name: policy.policyName! })) ?? []

            policies = policies.concat(newPolicies)
        } catch (e) {
            getLogger().error(`Failed to retrieve policies: %O`, e)
            showViewLogsMessage(localize('AWS.iot.attachPolicy.error', 'Failed to retrieve policies'), window)
            return undefined
        }
    } while (nextToken != undefined)

    //const policies = (await node.iot.listPolicies({})).policies
    const policyItems: DataQuickPickItem<IotPolicy | undefined>[] = policies.map(policy => {
        return {
            label: policy.name,
            data: policy,
        }
    })
    const placeHolder: DataQuickPickItem<IotPolicy | undefined> = {
        label: 'No policies found',
        data: undefined,
    }

    const picker = createQuickPick(policyItems, {
        title: localize('AWS.iot.attachPolicy', 'Select a policy'),
        placeholderItem: placeHolder,
        buttons: [vscode.QuickInputButtons.Back],
    })
    const result = await picker.prompt()
    if (!result || !isPolicy(result)) {
        getLogger().info('No policy chosen')
        return undefined
    }
    getLogger().info('Picker returned: %O', result)
    const policy = result as IotPolicy
    try {
        await node.iot.attachPolicy({ policyName: policy.name, target: certArn })
    } catch (e) {
        getLogger().error(`Failed to attach policy ${policy.name}: %O`, e)
        showViewLogsMessage(localize('AWS.iot.attachCert.error', 'Failed to attach policy {0}', policy.name), window)
        return undefined
    }

    getLogger().debug('Attached policy %O', policy.name)

    await refreshNode(node, commands)
}

function isPolicy(policy: IotPolicy | WizardControl): policy is IotPolicy {
    return (policy as IotPolicy).arn != undefined
}

async function refreshNode(node: IotCertWithPoliciesNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
