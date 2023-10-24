/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { Service } from 'aws-sdk'
import globals from '../../shared/extensionGlobals'
import { ServiceOptions } from '../../shared/awsClientBuilder'
import { Auth } from '../../auth/auth'
import { isIamConnection } from '../../auth/connection'
import { ToolkitError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { LambdaClient } from '../../shared/clients/lambdaClient'
import { getConfig } from '../config'
import { LocalResolvedConfig } from '../types'
import { invoke } from '../util/invoke'
import apiConfig = require('./weaverbird-2018-05-10.api.json')
import {
    CreateUploadUrlRequest,
    CreateUploadUrlResponse,
    StartConversationRequest,
    StartConversationResponse,
} from './weaverbirdclient'
import * as WeaverbirdClient from './weaverbirdclient'

export async function createWeaverbirdSdkClient(): Promise<WeaverbirdClient> {
    const conn = Auth.instance.activeConnection
    if (!isIamConnection(conn)) {
        throw new ToolkitError('Connection is not an IAM connection', { code: 'BadConnectionType' })
    }
    const weaverbirdConfig = await getConfig()
    return (await globals.sdkClientBuilder.createAwsService(
        Service,
        {
            apiConfig: apiConfig,
            region: weaverbirdConfig.region,
            credentials: await conn.getCredentials(),
            endpoint: weaverbirdConfig.endpoint,
            onRequestSetup: [
                req => {
                    console.log(JSON.stringify(req.httpRequest))
                    // do something here
                },
            ],
        } as ServiceOptions,
        undefined
    )) as WeaverbirdClient
}

/**
 * At the moment, there is only one upload intent for weaverbird, namely the constant below.
 *
 * This has been modelled by codewhisperer's suggestions and will be eventually revisited and removed to avoid exposing this information in open source code.
 */
const WBUploadIntent = 'WeaverBirdPlanning'
export class WeaverbirdLambdaClient {
    private client: LambdaClient
    private lambdaArns: LocalResolvedConfig['lambdaArns']

    constructor(client: LambdaClient, lambdaArns: LocalResolvedConfig['lambdaArns']) {
        this.client = client
        this.lambdaArns = lambdaArns
    }

    /**
     * startConversation
     *
     * it starts the conversation with the backend by generating a conversation id
     */
    public async startConversation() {
        try {
            const response = await invoke<StartConversationRequest, StartConversationResponse>(
                this.client,
                this.lambdaArns.setup.startConversation,
                // all of that is just mock data so that we can invoke lambdas explicitly before proxy layer is done
                {
                    clientMetadata: {
                        userIdentity: {
                            oidcUserID: 'fake-user-id',
                        },
                    },
                }
            )
            return response.conversationId
        } catch (e) {
            getLogger().error(`weaverbird: failed to start conversation: ${(e as Error).message}`)
            throw e
        }
    }

    /**
     * generatePresignedUrl
     *
     * Generate a presigned url calling weaverbird API with the conversationId and repo checksum as input
     */
    public async generatePresignedUrl(conversationId: string, contentChecksumSha256: string) {
        try {
            const response = await invoke<CreateUploadUrlRequest, CreateUploadUrlResponse>(
                this.client,
                this.lambdaArns.setup.createUploadUrl,
                {
                    conversationId,
                    contentChecksumSha256,
                    uploadIntent: WBUploadIntent,
                }
            )
            return response.uploadUrl
        } catch (e) {
            getLogger().error(`weaverbird: failed to generate presigned url: ${(e as Error).message}`)
            throw e
        }
    }
}
