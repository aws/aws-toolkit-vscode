/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from '../../../shared/logger'
import { localize } from '../../../shared/utilities/vsCodeUtils'
import { showViewLogsMessage } from '../../../shared/utilities/messages'
import { IotCertsFolderNode } from '../explorer/iotCertFolderNode'
import { fileExists } from '../../../shared/filesystemUtilities'
import { Iot } from 'aws-sdk'
import { fs } from '../../../shared'

// eslint-disable-next-line @typescript-eslint/naming-convention
const MODE_RW_R_R = 0o644 // File permission 0644 rw-r--r-- for PEM files.
// eslint-disable-next-line @typescript-eslint/naming-convention
const PEM_FILE_ENCODING = 'ascii'

/**
 * Command to create a certificate key pair and save them to the filesystem.
 */
export async function createCertificateCommand(
    node: IotCertsFolderNode,
    promptFunc = promptForSaveLocation,
    saveFunc = saveCredentials
): Promise<void> {
    getLogger().debug('CreateCertificate called for %O', node)

    const folderLocation = await promptFunc()
    if (!folderLocation) {
        getLogger().info('CreateCertificate canceled: No folder selected')
        return
    }

    let certificate: Iot.CreateKeysAndCertificateResponse

    try {
        certificate = await node.iot.createCertificateAndKeys({
            setAsActive: false,
        })
    } catch (e) {
        getLogger().error('Failed to create certificate: %s', e)
        void showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'))
        return undefined
    }

    const certId = certificate!.certificateId
    const certPem = certificate!.certificatePem
    const privateKey = certificate!.keyPair?.PrivateKey
    const publicKey = certificate!.keyPair?.PublicKey

    if (!certPem || !privateKey || !publicKey) {
        getLogger().error('Could not download certificate. Certificate is missing either the PEM or key pair.')
        void showViewLogsMessage(localize('AWS.iot.createCert.error', 'Failed to create certificate'))
        return undefined
    }

    getLogger().info(`Downloaded certificate ${certId}`)
    void vscode.window.showInformationMessage(localize('AWS.iot.createCert.success', 'Created certificate {0}', certId))

    // Save resources
    const saveSuccessful = await saveFunc(folderLocation, certId!, certPem, privateKey, publicKey)
    if (!saveSuccessful) {
        // Delete the certificate if the key pair cannot be saved
        try {
            await node.iot.deleteCertificate({ certificateId: certId! })
        } catch (e) {
            getLogger().error(`Failed to delete Certificate ${certId}: %s`, e)
            void showViewLogsMessage(localize('AWS.iot.deleteCert.error', 'Failed to delete Certificate {0}', certId))
        }
    }

    // Refresh the Certificate Folder node
    await node.refreshNode()
}

/**
 * Prompts for folder in which to save certificate and keys
 */
async function promptForSaveLocation(): Promise<vscode.Uri | undefined> {
    const folderLocation = await vscode.window.showOpenDialog({
        openLabel: localize('AWS.iot.downloadCert.openButton', 'Save certificate here'),
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
    })

    if (!folderLocation || folderLocation.length === 0) {
        return undefined
    }

    return folderLocation[0]
}

/**
 * Saves certificate and key pair to the file system
 * @returns `true` if writes succeed, else `false`.
 */
async function saveCredentials(
    basePath: vscode.Uri,
    certName: string,
    certPem: string,
    privateKey: string,
    publicKey: string
): Promise<boolean> {
    const dir = basePath.fsPath
    const certPath = path.join(dir, `${certName}-certificate.pem.crt`)
    const privateKeyPath = path.join(dir, `${certName}-private.pem.key`)
    const publicKeyPath = path.join(dir, `${certName}-public.pem.key`)

    const certExists = await fileExists(certPath)
    const privateKeyExists = await fileExists(privateKeyPath)
    const publicKeyExists = await fileExists(publicKeyPath)

    if (certExists) {
        getLogger().error('Certificate path %s already exists', certPath)
        void vscode.window.showErrorMessage(
            localize('AWS.iot.createCert.error', 'Failed to create certificate. Path {0} already exists.', certPath)
        )
        return false
    }
    if (privateKeyExists) {
        getLogger().error('Key path %s already exists', privateKeyPath)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.iot.createCert.error',
                'Failed to create certificate. Path {0} already exists.',
                privateKeyPath
            )
        )
        return false
    }
    if (publicKeyExists) {
        getLogger().error('Key path %s already exists', publicKeyPath)
        void vscode.window.showErrorMessage(
            localize(
                'AWS.iot.createCert.error',
                'Failed to create certificate. Path {0} already exists.',
                publicKeyPath
            )
        )
        return false
    }
    try {
        await fs.writeFile(certPath, certPem, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
        await fs.writeFile(privateKeyPath, privateKey, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
        await fs.writeFile(publicKeyPath, publicKey, { encoding: PEM_FILE_ENCODING, mode: MODE_RW_R_R })
    } catch (e) {
        getLogger().error('Could not save certificate: %s', e)
        void showViewLogsMessage(localize('AWS.iot.createCert.saveError', 'Failed to save certificate'))
        return false
    }
    return true
}
