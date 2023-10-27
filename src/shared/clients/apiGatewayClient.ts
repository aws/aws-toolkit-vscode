/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */



import {
    APIGateway,
    GetResourcesCommandInput,
    GetResourcesCommandOutput,
    GetRestApisCommandInput,
    GetRestApisCommandOutput,
    GetStagesCommandOutput,
    TestInvokeMethodCommandInput,
    TestInvokeMethodCommandOutput,
    UpdateResourceCommandOutput,
    UpdateRestApiCommandOutput,
} from "@aws-sdk/client-api-gateway";

import globals from '../extensionGlobals'
import { ClassToInterfaceType } from '../utilities/tsUtils'

export type ApiGatewayClient = ClassToInterfaceType<DefaultApiGatewayClient>
export class DefaultApiGatewayClient {
    public constructor(public readonly regionCode: string) {}

    public async *getResourcesForApi(apiId: string): AsyncIterableIterator<UpdateResourceCommandOutput> {
        const client = await this.createSdkClient()

        const request: GetResourcesCommandInput = {
            restApiId: apiId,
        }

        do {
            const response: GetResourcesCommandOutput = await client.getResources(request).promise()

            if (response.items !== undefined && response.items.length > 0) {
                yield* response.items
            }

            request.position = response.position
        } while (request.position !== undefined)
    }

    public async getStages(apiId: string): Promise<GetStagesCommandOutput> {
        const client = await this.createSdkClient()

        const request: GetResourcesCommandInput = {
            restApiId: apiId,
        }

        return client.getStages(request).promise()
    }

    public async *listApis(): AsyncIterableIterator<UpdateRestApiCommandOutput> {
        const client = await this.createSdkClient()

        const request: GetRestApisCommandInput = {}

        do {
            const response: GetRestApisCommandOutput = await client.getRestApis(request).promise()

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
    ): Promise<TestInvokeMethodCommandOutput> {
        const client = await this.createSdkClient()
        const request: TestInvokeMethodCommandInput = {
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
