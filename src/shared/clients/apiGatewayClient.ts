/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { APIGateway } from 'aws-sdk'
import { ext } from '../extensionGlobals'
import '../utilities/asyncIteratorShim'
import { RestApi, Stages } from 'aws-sdk/clients/apigateway'
import { ClassToInterfaceType } from '../utilities/tsUtils'
import { AsyncCollection, pageableToCollection } from '../utilities/collectionUtils'

export type ApiGatewayClient = ClassToInterfaceType<DefaultApiGatewayClient>
export class DefaultApiGatewayClient {
    public constructor(public readonly regionCode: string) {}

    public getResourcesForApi(request: APIGateway.GetResourcesRequest): AsyncCollection<APIGateway.Resource[]> {
        const client = this.createSdkClient()
        const requester = async (request: APIGateway.GetResourcesRequest) =>
            (await client).getResources(request).promise()

        return pageableToCollection(requester, request, 'position', 'items').filter(
            i => i !== undefined && i.length > 0
        )
    }

    public getAllResourcesForApi(request: APIGateway.GetResourcesRequest): Promise<APIGateway.Resource[]> {
        return this.getResourcesForApi(request).flatten().promise()
    }

    public async getStages(apiId: string): Promise<Stages> {
        const client = await this.createSdkClient()

        const request: APIGateway.GetResourcesRequest = {
            restApiId: apiId,
        }

        return client.getStages(request).promise()
    }

    public listApis(request: APIGateway.GetRestApisRequest = {}): AsyncCollection<RestApi[]> {
        const client = this.createSdkClient()
        const requester = async (request: APIGateway.GetRestApisRequest) =>
            (await client).getRestApis(request).promise()

        return pageableToCollection(requester, request, 'position', 'items').filter(
            i => i !== undefined && i.length > 0
        )
    }

    public listAllApis(request: APIGateway.GetRestApisRequest = {}): Promise<RestApi[]> {
        return this.listApis(request).flatten().promise()
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
        return await ext.sdkClientBuilder.createAwsService(APIGateway, undefined, this.regionCode)
    }
}
