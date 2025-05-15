/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    bearerCredentialsUpdateRequestType,
    ConnectionMetadata,
    NotificationType,
    RequestType,
    ResponseMessage,
    updateConfigurationRequestType,
    UpdateCredentialsParams,
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
    #logErrorIfChanged = onceChanged((s) => getLogger('amazonqLsp').error(s))
    private constructor(
        private readonly client: LanguageClient,
        private readonly authUtil: AuthUtil
    ) {}

    /**
     * Intialize the auth syncing with the Language Server.
     * It is critical that the following happens in the correct order:
     * 1. send the bearer token
     * 2. send the profile selection.
     * @param client
     * @param authUtil
     * @returns
     */
    static async initialize(client: LanguageClient, authUtil: AuthUtil = AuthUtil.instance) {
        const auth = new AmazonQLspAuth(client, authUtil)
        await auth.refreshConnection()
        await auth.sendProfileToLsp(client)
        return auth
    }
    /**
     * @param force bypass memoization, and forcefully update the bearer token
     */
    async refreshConnection(force: boolean = false) {
        const activeConnection = this.authUtil.conn
        if (activeConnection?.type === 'sso' && this.authUtil.isConnectionValid()) {
            // send the token to the language server
            const token = await this.authUtil.getBearerToken()
            await (force ? this._updateBearerToken(token) : this.updateBearerToken(token))
        }
    }

    async logRefreshError(e: unknown) {
        const err = e as Error
        this.#logErrorIfChanged(`Unable to update bearer token: ${err.name}:${err.message}`)
    }

    public updateBearerToken = onceChanged(this._updateBearerToken.bind(this))
    private async _updateBearerToken(token: string) {
        const request = await this.createUpdateCredentialsRequest({
            token,
        })

        await this.client.sendRequest(bearerCredentialsUpdateRequestType.method, request)

        this.client.info(`UpdateBearerToken: ${JSON.stringify(request)}`)
    }

    public startTokenRefreshInterval(pollingTime: number = oneMinute / 2) {
        const interval = setInterval(async () => {
            await this.refreshConnection().catch((e) => this.logRefreshError(e))
        }, pollingTime)
        return interval
    }

    private async createUpdateCredentialsRequest(data: any): Promise<UpdateCredentialsParams> {
        const payload = new TextEncoder().encode(JSON.stringify({ data }))

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

    public async sendProfileToLsp(client: LanguageClient) {
        try {
            const result = await client.sendRequest(updateConfigurationRequestType.method, {
                section: 'aws.q',
                settings: {
                    profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
                },
            })
            client.info(
                `Client: Updated Amazon Q Profile ${AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn} to Amazon Q LSP`,
                result
            )
        } catch (err) {
            client.error('Error when setting Q Developer Profile to Amazon Q LSP', err)
        }
    }
}
