/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { APIGateway } from 'aws-sdk'
import { RestApi, Stages } from 'aws-sdk/clients/apigateway'
import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type ApiGatewayClient = ClassToInterfaceType<DefaultApiGatewayClient>
export class DefaultApiGatewayClient {
    public constructor(public readonly regionCode: string) {}

    public async *getResourcesForApi(apiId: string): AsyncIterableIterator<APIGateway.Resource> {
        const client = await this.createSdkClient()

        const request: APIGateway.GetResourcesRequest = {
            restApiId: apiId,
        }

        do {
            const response: APIGateway.Resources = await client.getResources(request).promise()

            if (response.items !== undefined && response.items.length > 0) {
                yield* response.items
            }

            request.position = response.position
        } while (request.position !== undefined)
    }

    public async getStages(apiId: string): Promise<Stages> {
        const client = await this.createSdkClient()

        const request: APIGateway.GetResourcesRequest = {
            restApiId: apiId,
        }

        return client.getStages(request).promise()
    }

    public async *listApis(): AsyncIterableIterator<RestApi> {
        const client = await this.createSdkClient()

        const request: APIGateway.GetRestApisRequest = {}

        do {
            const response: APIGateway.RestApis = await client.getRestApis(request).promise()

            if (response.items !== undefined && response.items.length > 0) {
                yield* response.items
            }

            request.position = response.position
        } while (request.position !== undefined)
    }

    public async testInvokeMethod(
        apiId: string,
        resourceId: string,
        method: string,
        body: string,
        pathWithQueryString: string | undefined
    ): Promise<APIGateway.TestInvokeMethodResponse> {
        const client = await this.createSdkClient()
        const request: APIGateway.TestInvokeMethodRequest = {
            restApiId: apiId,
            resourceId: resourceId,
            httpMethod: method,
            body: body,
        }
        if (pathWithQueryString) {
            request.pathWithQueryString = pathWithQueryString
        }

        return await client.testInvokeMethod(request).promise()
    }

    private async createSdkClient(): Promise<APIGateway> {
        return await globals.sdkClientBuilder.createAwsService(APIGateway, undefined, this.regionCode)
    }
}
