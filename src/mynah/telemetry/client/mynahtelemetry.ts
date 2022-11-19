/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from 'aws-sdk'
import apiConfig = require('./service-2.json')
import globals from '../../../shared/extensionGlobals'
import * as MynahTelemetryClient from './mynahtelemetryclient'
import { ServiceOptions } from '../../../shared/awsClientBuilder'
import { TELEMETRY_CLIENT_CONNECTION_TIMEOUT, TELEMETRY_CLIENT_SOCKET_TIMEOUT } from '../telemetry/configuration'
import { NodeHttpHandler } from '@aws-sdk/node-http-handler'
import { fromCognitoIdentity } from '@aws-sdk/credential-providers'

const TELEMETRY_ENDPOINT = 'https://40f573ts0g.execute-api.us-east-1.amazonaws.com/beta'
const REGION = 'us-east-1'

export type BatchPostEventRequest = Readonly<MynahTelemetryClient.BatchPostEventRequest>
export type BatchPostEventResponse = MynahTelemetryClient.BatchPostEventResponse
export type Event = MynahTelemetryClient.Event

export class DefaultMynahTelemetryClient {
    private constructor(private readonly client: MynahTelemetryClient) {}

    public static async createDefaultClient(resolvedIdentityId: string): Promise<DefaultMynahTelemetryClient> {
        const CognitoCredentialProvider = fromCognitoIdentity({
            identityId: resolvedIdentityId,
            clientConfig: { region: REGION },
        })
        const credentials = await CognitoCredentialProvider()
        return new DefaultMynahTelemetryClient(
            (await globals.sdkClientBuilder.createAwsService(
                Service,
                {
                    requestHandler: new NodeHttpHandler({
                        connectionTimeout: TELEMETRY_CLIENT_CONNECTION_TIMEOUT,
                        socketTimeout: TELEMETRY_CLIENT_SOCKET_TIMEOUT,
                    }),
                    apiConfig: apiConfig,
                    region: REGION,
                    credentials: credentials,
                    endpoint: TELEMETRY_ENDPOINT,
                } as ServiceOptions,
                undefined,
                false
            )) as MynahTelemetryClient
        )
    }

    public async batchPostEvent(
        request: MynahTelemetryClient.BatchPostEventRequest
    ): Promise<MynahTelemetryClient.BatchPostEventResponse> {
        return await this.client.batchPostEvent(request).promise()
    }
}
