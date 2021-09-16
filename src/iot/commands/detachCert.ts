/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as localizedText from '../../shared/localizedText'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { IotThingCertNode } from '../explorer/iotCertificateNode'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotThingNode } from '../explorer/iotThingNode'

/**
 * Detaches a certificate from an IoT Thing.
 *
 * Prompts the user for confirmation.
 * Detaches the certificate.
 * Refreshes the parent node.
 */
export async function detachThingCertCommand(
    node: IotThingCertNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('DetachCert called for %O', node)

    const certId = node.certificate.id
    const certArn = node.certificate.arn
    const thingName = node.parent.thing.name

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize(
                'AWS.iot.detachCert.prompt',
                'Are you sure you want to detach certificate from Thing {0}?',
                thingName
            ),
            confirm: localize('AWS.iot.detachCert.confirm', 'Detach'),
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('DetachCert canceled')
        return
    }

    getLogger().info(`Detaching certificate ${certId}`)
    try {
        await node.iot.detachThingPrincipal({ thingName: thingName, principal: certArn })

        getLogger().info(`Successfully detached certificate from Thing ${thingName}`)
        window.showInformationMessage(localize('AWS.iot.detachCert.success', 'Detached {0}', node.certificate.id))
    } catch (e) {
        getLogger().error(`Failed to detach certificate ${certId}: %O`, e)
        showViewLogsMessage(localize('AWS.iot.detachCert.error', 'Failed to detach {0}', node.certificate.id), window)
    }

    await refreshNode(node.parent, commands)
}

async function refreshNode(node: IotThingNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
