/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as localizedText from '../../shared/localizedText'
import * as fs from 'fs-extra'
import { getLogger } from '../../shared/logger'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage, showConfirmationMessage } from '../../shared/utilities/messages'
import { IotCertsFolderNode } from '../explorer/iotCertFolderNode'
import { fileExists } from '../../shared/filesystemUtilities'

const MODE_RW_R_R = 420 //File permission 0644 rw-r--r-- for PEM files.
const PEM_FILE_ENCODING = 'ascii'

/**
 * Command to create a certificate key pair and save them to the filesystem.
 */
export async function createCertificateCommand(
    node: IotCertsFolderNode,
    window = Window.vscode(),
    commands = Commands.vscode()
): Promise<void> {
    getLogger().debug('CreateCertificate called for %O', node)

    const isConfirmed = await showConfirmationMessage(
        {
            prompt: localize('AWS.iot.createCert.prompt', 'Create a new X.509 certificate and RSA key pair?'),
            confirm: localize('AWS.iot.createCert.confirm', 'Confirm'),
            cancel: localizedText.cancel,
        },
        window
    )
    if (!isConfirmed) {
        getLogger().info('CreateCertificate canceled')
        return
    }

    const folderLocation = await promptForSaveLocation(window)
    if (!folderLocation) {
        getLogger().info('CreateCertificate canceled: No folder selected')
        return
    }
    const certPath = `${folderLocation.fsPath}-certificate.pem.crt`
    const privateKeyPath = `${folderLocation.fsPath}-private.pem.key`
    const publicKeyPath = `${folderLocation.fsPath}-public.pem.key`

    const certExists = await fileExists(certPath)
    const privateKeyExists = await fileExists(privateKeyPath)
    const publicKeyExists = await fileExists(publicKeyPath)

    if (certExists) {
        getLogger().error('Certificate path {0} already exists', certPath)
        showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
        return undefined
    }
    if (privateKeyExists) {
        getLogger().error('Key path {0} already exists', privateKeyPath)
        showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
        return undefined
    }
    if (publicKeyExists) {
        getLogger().error('Key path {0} already exists', publicKeyPath)
        showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
        return undefined
    }

    let certId: string | undefined
    let certPem: string | undefined
    let privateKey: string | undefined
    let publicKey: string | undefined
    try {
        const certificate = await node.iot.createCertificateAndKeys({
            setAsActive: false,
        })
        certId = certificate.certificateId
        certPem = certificate.certificatePem
        privateKey = certificate.keyPair?.PrivateKey
        publicKey = certificate.keyPair?.PublicKey

        if (!certPem || !privateKey || !publicKey) {
            getLogger().error('Could not download certificate')
            showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
            return undefined
        }

        //Save resources
        await fs.writeFile(certPath, certPem, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
        await fs.writeFile(privateKeyPath, privateKey, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
        await fs.writeFile(publicKeyPath, publicKey, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
        getLogger().info(`Downloaded certificate ${certId}`)
    } catch (e) {
        getLogger().error('Failed to create and save certificate: %O', e)
        showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'), window)
    }

    await refreshNode(node, commands)
}

async function promptForSaveLocation(window: Window): Promise<vscode.Uri | undefined> {
    // const folderLocation = await window.showOpenDialog({
    //     openLabel: localize('AWS.iot.downloadCert.openButton', 'Save certificate here'),
    //     canSelectFolders: true,
    //     canSelectFiles: false,
    //     canSelectMany: false,
    // })

    // if (!folderLocation || folderLocation.length == 0) {
    //     return undefined
    // }

    // return folderLocation[0]
    const saveLocation = await window.showSaveDialog({})
    if (!saveLocation) {
        return undefined
    }
    return saveLocation
}

async function refreshNode(node: IotCertsFolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}
