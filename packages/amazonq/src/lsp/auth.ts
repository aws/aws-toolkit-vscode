/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ConnectionMetadata,
    NotificationType,
    RequestType,
    ResponseMessage,
} from '@aws/language-server-runtimes/protocol'
import * as jose from 'jose'
import * as crypto from 'crypto'
import { LanguageClient } from 'vscode-languageclient'
import { AuthUtil } from 'aws-core-vscode/codewhisperer'
import { Writable } from 'stream'
import { onceChanged } from 'aws-core-vscode/utils'
import { getLogger, oneMinute } from 'aws-core-vscode/shared'

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
    constructor(private readonly client: LanguageClient) {}

    async refreshConnection() {
        const activeConnection = AuthUtil.instance.auth.activeConnection
        if (activeConnection?.type === 'sso') {
            // send the token to the language server
            const token = await AuthUtil.instance.getBearerToken()
            await this.updateBearerToken(token)
        }
    }

    public updateBearerToken = onceChanged(this._updateBearerToken.bind(this))
    private async _updateBearerToken(token: string) {
        const request = await this.createUpdateCredentialsRequest({
            token,
        })

        await this.client.sendRequest(notificationTypes.updateBearerToken.method, request)

        this.client.info(`UpdateBearerToken: ${JSON.stringify(request)}`)
    }

    public startTokenRefreshInterval(pollingTime: number = oneMinute) {
        const interval = setInterval(async () => {
            await this.refreshConnection().catch((e) => {
                getLogger('amazonqLsp').error('Unable to update bearer token: %s', (e as Error).message)
                clearInterval(interval)
            })
        }, pollingTime)
        return interval
    }

    private async createUpdateCredentialsRequest(data: any) {
        const payload = new TextEncoder().encode(JSON.stringify({ data }))

        const jwt = await new jose.CompactEncrypt(payload)
            .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
            .encrypt(encryptionKey)

        return {
            data: jwt,
            encrypted: true,
        }
    }
}
