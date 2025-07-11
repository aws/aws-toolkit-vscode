/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    bearerCredentialsUpdateRequestType,
    iamCredentialsUpdateRequestType,
    ConnectionMetadata,
    NotificationType,
    RequestType,
    ResponseMessage,
    UpdateCredentialsParams,
} from '@aws/language-server-runtimes/protocol'
import * as jose from 'jose'
import * as crypto from 'crypto'
import { LanguageClient } from 'vscode-languageclient'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { Writable } from 'stream'
import { onceChanged } from 'aws-core-vscode/utils'
import { getLogger, oneMinute, isSageMaker } from 'aws-core-vscode/shared'
import { isSsoConnection, isIamConnection } from 'aws-core-vscode/auth'

export const encryptionKey = crypto.randomBytes(32)

/**
 * Sends a json payload to the language server, who is waiting to know what the encryption key is.
 * Code reference: https://github.com/aws/language-servers/blob/7da212185a5da75a72ce49a1a7982983f438651a/client/vscode/src/credentialsActivation.ts#L77
 */
export function writeEncryptionInit(stream: Writable): void {
    const request = {
        version: '1.0',
        mode: 'JWT',
        key: encryptionKey.toString('base64'),
    }
    stream.write(JSON.stringify(request))
    stream.write('\n')
}

/**
 * Request for custom notifications that Update Credentials and tokens.
 * See core\aws-lsp-core\src\credentials\updateCredentialsRequest.ts for details
 */
export interface UpdateCredentialsRequest {
    /**
     * Encrypted token (JWT or PASETO)
     * The token's contents differ whether IAM or Bearer token is sent
     */
    data: string
    /**
     * Used by the runtime based language servers.
     * Signals that this client will encrypt its credentials payloads.
     */
    encrypted: boolean
}

export const notificationTypes = {
    updateBearerToken: new RequestType<UpdateCredentialsRequest, ResponseMessage, Error>(
        'aws/credentials/token/update'
    ),
    deleteBearerToken: new NotificationType('aws/credentials/token/delete'),
    getConnectionMetadata: new RequestType<undefined, ConnectionMetadata, Error>(
        'aws/credentials/getConnectionMetadata'
    ),
}

/**
 * Facade over our VSCode Auth that does crud operations on the language server auth
 */
export class AmazonQLspAuth {
    #logErrorIfChanged = onceChanged((s) => getLogger('amazonqLsp').error(s))
    constructor(
        private readonly client: LanguageClient,
        private readonly authUtil: AuthUtil = AuthUtil.instance
    ) {}

    /**
     * @param force bypass memoization, and forcefully update the bearer token
     */
    async refreshConnection(force: boolean = false) {
        const activeConnection = this.authUtil.conn
        if (this.authUtil.isConnectionValid()) {
            if (isSsoConnection(activeConnection)) {
                // Existing SSO path
                const token = await this.authUtil.getBearerToken()
                await (force ? this._updateBearerToken(token) : this.updateBearerToken(token))
            } else if (isSageMaker() && isIamConnection(activeConnection)) {
                // New SageMaker IAM path
                const credentials = await this.authUtil.getCredentials()
                await (force ? this._updateIamCredentials(credentials) : this.updateIamCredentials(credentials))
            }
        }
    }

    async logRefreshError(e: unknown) {
        const err = e as Error
        this.#logErrorIfChanged(`Unable to update bearer token: ${err.name}:${err.message}`)
    }

    public updateBearerToken = onceChanged(this._updateBearerToken.bind(this))
    private async _updateBearerToken(token: string) {
        const request = await this.createUpdateBearerCredentialsRequest(token)

        // "aws/credentials/token/update"
        // https://github.com/aws/language-servers/blob/44d81f0b5754747d77bda60b40cc70950413a737/core/aws-lsp-core/src/credentials/credentialsProvider.ts#L27
        await this.client.sendRequest(bearerCredentialsUpdateRequestType.method, request)

        this.client.info(`UpdateBearerToken: ${JSON.stringify(request)}`)
    }

    public updateIamCredentials = onceChanged(this._updateIamCredentials.bind(this))
    private async _updateIamCredentials(credentials: any) {
        getLogger().info(
            `[SageMaker Debug] Updating IAM credentials - credentials received: ${credentials ? 'YES' : 'NO'}`
        )
        if (credentials) {
            getLogger().info(
                `[SageMaker Debug] IAM credentials structure: accessKeyId=${credentials.accessKeyId ? 'present' : 'missing'}, secretAccessKey=${credentials.secretAccessKey ? 'present' : 'missing'}, sessionToken=${credentials.sessionToken ? 'present' : 'missing'}`
            )
        }

        const request = await this.createUpdateIamCredentialsRequest(credentials)

        // "aws/credentials/iam/update"
        await this.client.sendRequest(iamCredentialsUpdateRequestType.method, request)

        this.client.info(`UpdateIamCredentials: ${JSON.stringify(request)}`)
        getLogger().info(`[SageMaker Debug] IAM credentials update request sent successfully`)
    }

    public startTokenRefreshInterval(pollingTime: number = oneMinute / 2) {
        const interval = setInterval(async () => {
            await this.refreshConnection().catch((e) => this.logRefreshError(e))
        }, pollingTime)
        return interval
    }

    private async createUpdateBearerCredentialsRequest(token: string): Promise<UpdateCredentialsParams> {
        const bearerCredentials = { token }
        const payload = new TextEncoder().encode(JSON.stringify({ data: bearerCredentials }))

        const jwt = await new jose.CompactEncrypt(payload)
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .encrypt(encryptionKey)

        return {
            data: jwt,
            metadata: {
                sso: {
                    startUrl: AuthUtil.instance.startUrl,
                },
            },
            encrypted: true,
        }
    }

    private async createUpdateIamCredentialsRequest(credentials: any): Promise<UpdateCredentialsParams> {
        // Extract IAM credentials structure
        const iamCredentials = {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
        }
        const payload = new TextEncoder().encode(JSON.stringify({ data: iamCredentials }))

        const jwt = await new jose.CompactEncrypt(payload)
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .encrypt(encryptionKey)

        return {
            data: jwt,
            // Omit metadata for IAM credentials since startUrl is undefined for non-SSO connections
            encrypted: true,
        }
    }
}
