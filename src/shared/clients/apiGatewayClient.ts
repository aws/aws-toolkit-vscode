/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RestApi } from 'aws-sdk/clients/apigateway'

export interface ApiGatewayClient {
    readonly regionCode: string

    listApis(): AsyncIterableIterator<RestApi>
}
