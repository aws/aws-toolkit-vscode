/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RestApi, Resource, TestInvokeMethodResponse, Stages } from 'aws-sdk/clients/apigateway'

export interface ApiGatewayClient {
    readonly regionCode: string

    getResourcesForApi(apiId: string): AsyncIterableIterator<Resource>

    getStages(apiId: string): Promise<Stages>

    listApis(): AsyncIterableIterator<RestApi>

    testInvokeMethod(
        apiId: string,
        resourceId: string,
        method: string,
        body: string,
        pathWithQueryString: string | undefined
    ): Promise<TestInvokeMethodResponse>
}
