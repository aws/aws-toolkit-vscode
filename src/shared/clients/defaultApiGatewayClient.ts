/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { APIGateway } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import '../utilities/asyncIteratorShim'
import { ApiGatewayClient } from './apiGatewayClient'
import { RestApi } from 'aws-sdk/clients/apigateway'

export class DefaultApiGatewayClient implements ApiGatewayClient {
    public constructor(public readonly regionCode: string) {}

    public async *listApis(): AsyncIterableIterator<RestApi> {
        const client = await this.createSdkClient()

        const request: APIGateway.GetRestApisRequest = {}

        do {
            const response: APIGateway.RestApis = await client.getRestApis(request).promise()

            if (!!response.items) {
                yield* response.items
            }

            request.position = response.position
        } while (!!request.position)
    }

    private async createSdkClient(): Promise<APIGateway> {
        return await ext.sdkClientBuilder.createAndConfigureServiceClient(
            options => new APIGateway(options),
            undefined,
            this.regionCode
        )
    }
}
