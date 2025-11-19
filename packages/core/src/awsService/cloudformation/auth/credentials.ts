/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Disposable } from 'vscode'
import { LanguageClient } from 'vscode-languageclient/node'
import { StacksManager } from '../stacks/stacksManager'
import { ResourcesManager } from '../resources/resourcesManager'
import { CloudFormationRegionManager } from '../explorer/regionManager'
import globals from '../../../shared/extensionGlobals'
import * as jose from 'jose'
import * as crypto from 'crypto'

export const encryptionKey = crypto.randomBytes(32)

export class AwsCredentialsService implements Disposable {
    private authChangeListener: Disposable
    private client: LanguageClient | undefined

    constructor(
        private stacksManager: StacksManager,
        private resourcesManager: ResourcesManager,
        private regionManager: CloudFormationRegionManager
    ) {
        this.authChangeListener = globals.awsContext.onDidChangeContext(() => {
            void this.updateCredentialsFromActiveConnection()
        })
    }

    async initialize(client: LanguageClient): Promise<void> {
        this.client = client
        await this.updateCredentialsFromActiveConnection()
    }

    private async updateCredentialsFromActiveConnection(): Promise<void> {
        if (!this.client) {
            return
        }

        const credentials = await globals.awsContext.getCredentials()
        const profileName = globals.awsContext.getCredentialProfileName()

        if (credentials && profileName) {
            const encryptedRequest = await this.createEncryptedCredentialsRequest({
                profile: profileName.replaceAll('profile:', ''),
                region: this.regionManager.getSelectedRegion(),
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken,
            })

            await this.client.sendRequest('aws/credentials/iam/update', encryptedRequest)
        }

        void this.stacksManager.reload()
        void this.resourcesManager.reload()
    }

    async updateRegion(): Promise<void> {
        await this.updateCredentialsFromActiveConnection()
    }

    private async createEncryptedCredentialsRequest(data: any): Promise<any> {
        const payload = new TextEncoder().encode(JSON.stringify({ data }))

        const jwt = await new jose.CompactEncrypt(payload)
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .encrypt(encryptionKey)

        return {
            data: jwt,
            encrypted: true,
        }
    }

    dispose(): void {
        this.authChangeListener.dispose()
    }
}
