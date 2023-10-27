/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands'
import { IotThingNode } from '../explorer/iotThingNode'
import { showViewLogsMessage } from '../../shared/utilities/messages'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { PromptResult } from '../../shared/ui/prompter'
import { IotClient } from '../../shared/clients/iotClient'
import { isValidResponse } from '../../shared/wizards/wizard'
import { Certificate, ListCertificatesCommandOutput } from "@aws-sdk/client-iot";

export type CertGen = typeof getCertList

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
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('AttachCertificate called for %O', node)

    const thingName = node.thing.name

    const cert = await promptFun(node.iot, getCertList)
    if (!isValidResponse(cert)) {
        getLogger().info('No certificate chosen')
        return undefined
    }
    getLogger().info('Picker returned: %O', cert)
    try {
        await node.iot.attachThingPrincipal({ thingName, principal: cert.certificateArn! })
    } catch (e) {
        getLogger().error(`Failed to attach certificate ${cert.certificateId}: %s`, e)
        showViewLogsMessage(
            localize('AWS.iot.attachCert.error', 'Failed to attach certificate {0}', cert.certificateId)
        )
        return undefined
    }

    getLogger().debug('Attached certificate %O', cert.certificateId)

    //Refresh the Thing node
    await node.refreshNode(commands)
}

/**
 * Prompts the user to pick a certificate to attach.
 */
async function promptForCert(iot: IotClient, certFetch: CertGen): Promise<PromptResult<Certificate>> {
    const placeHolder: DataQuickPickItem<Certificate> = {
        label: 'No certificates found',
        data: undefined,
    }
    const picker = createQuickPick(certFetch(iot), {
        title: localize('AWS.iot.attachCert', 'Select a certificate'),
        noItemsFoundItem: placeHolder,
        buttons: [vscode.QuickInputButtons.Back],
    })
    return picker.prompt()
}

/**
 * Async generator function to get the list of certificates when creating a quick pick.
 */
async function* getCertList(iot: IotClient) {
    let marker: string | undefined = undefined
    let filteredCerts: Certificate[]
    do {
        try {
            const certResponse: ListCertificatesCommandOutput = await iot.listCertificates({ marker })
            marker = certResponse.nextMarker

            /* These fields should always be defined when using the above API,
             * but we filter here anyway for when we use ! later. */
            filteredCerts =
                certResponse.certificates?.filter(
                    cert => cert.certificateArn && cert.certificateId && cert.status && cert.creationDate
                ) ?? []
        } catch (e) {
            getLogger().error(`Failed to retrieve certificates: %s`, e)
            showViewLogsMessage(localize('AWS.iot.attachCert.error', 'Failed to retrieve certificates'))
            return
        }
        yield filteredCerts.map(cert => ({ label: cert.certificateId!, data: cert }))
    } while (marker != undefined)
}
