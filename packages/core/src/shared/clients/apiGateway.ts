/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ClientWrapper } from './clientWrapper'
import {
    APIGatewayClient as ApiGatewayClientSDK,
    GetResourcesCommand,
    GetResourcesRequest,
    GetRestApisCommand,
    GetRestApisRequest,
    GetStagesCommand,
    Resource,
    Resources,
    RestApi,
    RestApis,
    Stages,
    TestInvokeMethodCommand,
    TestInvokeMethodRequest,
    TestInvokeMethodResponse,
} from '@aws-sdk/client-api-gateway'

export class ApiGatewayClient extends ClientWrapper<ApiGatewayClientSDK> {
    public constructor(regionCode: string) {
        super(regionCode, ApiGatewayClientSDK)
    }

    public async *getResourcesForApi(apiId: string): AsyncIterableIterator<Resource> {
        const request: GetResourcesRequest = {
            restApiId: apiId,
        }

        do {
            const response: Resources = await this.makeRequest(GetResourcesCommand, request)

            if (response.items !== undefined && response.items.length > 0) {
                yield* response.items
            }

            request.position = response.position
        } while (request.position !== undefined)
    }

    public async getStages(apiId: string): Promise<Stages> {
        return this.makeRequest(GetStagesCommand, {
            restApiId: apiId,
        })
    }

    public async *listApis(): AsyncIterableIterator<RestApi> {
        const request: GetRestApisRequest = {}

        do {
            const response: RestApis = await this.makeRequest(GetRestApisCommand, request)

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
    ): Promise<TestInvokeMethodResponse> {
        const request: TestInvokeMethodRequest = {
            restApiId: apiId,
            resourceId: resourceId,
            httpMethod: method,
            body: body,
        }
        if (pathWithQueryString) {
            request.pathWithQueryString = pathWithQueryString
        }

        return this.makeRequest(TestInvokeMethodCommand, request)
    }
}
