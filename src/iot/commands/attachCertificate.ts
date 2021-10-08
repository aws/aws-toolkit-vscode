/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { IotThingNode } from '../explorer/iotThingNode'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { PromptResult } from '../../shared/ui/prompter'
import { DefaultIotCertificate, IotCertificate } from '../../shared/clients/iotClient'
import { WizardControl } from '../../shared/wizards/wizard'
import { Iot } from 'aws-sdk'

/**
 * Attaches a certificate to the thing represented by the given node.
 *
 * Prompts the user to select a certificate
 * Attaches the certificate.
 * Refreshes the thing node.
 */
export async function attachCertificateCommand(
    node: IotThingNode,
    promptFun = promptForCert,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('AttachCertificate called for %O', node)

    const thingName = node.thing.name

    let nextToken: string | undefined = undefined
    let certificates: IotCertificate[] = []
    do {
        try {
            const certResponse: Iot.ListCertificatesResponse = await node.iot.listCertificates({ marker: nextToken })
            nextToken = certResponse.nextMarker

            const newCerts =
                certResponse.certificates
                    ?.filter(cert => cert.certificateArn && cert.certificateId && cert.status && cert.creationDate)
                    .map(
                        cert =>
                            new DefaultIotCertificate({
                                arn: cert.certificateArn!,
                                id: cert.certificateId!,
                                activeStatus: cert.status!,
                                creationDate: cert.creationDate!,
                            })
                    ) ?? []

            certificates = certificates.concat(newCerts)
        } catch (e) {
            getLogger().error(`Failed to retrieve certificates: %O`, e)
            showViewLogsMessage(localize('AWS.iot.attachCert.error', 'Failed to retrieve certificates'), window)
            return undefined
        }
    } while (nextToken != undefined)

    const certItems: DataQuickPickItem<IotCertificate | undefined>[] = certificates.map(cert => {
        return {
            label: cert.id,
            data: cert,
        }
    })

    const result = await promptFun(certItems)
    if (!result || !isCert(result)) {
        getLogger().info('No certificate chosen')
        return undefined
    }
    getLogger().info('Picker returned: %O', result)
    const cert = result as IotCertificate
    try {
        await node.iot.attachThingPrincipal({ thingName: thingName, principal: cert.arn })
    } catch (e) {
        getLogger().error(`Failed to attach certificate ${cert.id}: %O`, e)
        showViewLogsMessage(localize('AWS.iot.attachCert.error', 'Failed to attach certificate {0}', cert.id), window)
        return undefined
    }

    getLogger().debug('Attached certificate %O', cert.id)

    await refreshNode(node, commands)
}

async function promptForCert(
    certItems: DataQuickPickItem<IotCertificate | undefined>[]
): Promise<PromptResult<IotCertificate | undefined>> {
    const placeHolder: DataQuickPickItem<IotCertificate | undefined> = {
        label: 'No certificates found',
        data: undefined,
    }
    const picker = createQuickPick(certItems, {
        title: localize('AWS.iot.attachCert', 'Select a certificate'),
        noItemsFoundItem: placeHolder,
        buttons: [vscode.QuickInputButtons.Back],
    })
    return picker.prompt()
}

function isCert(cert: IotCertificate | WizardControl): cert is IotCertificate {
    return (cert as IotCertificate).arn != undefined
}

async function refreshNode(node: IotThingNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
