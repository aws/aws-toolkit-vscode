/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from 'aws-sdk'
import apiConfig = require('./service-2.json')
import globals from '../../shared/extensionGlobals'
import * as MynahClient from './mynahclient'
import { ServiceOptions } from '../../shared/awsClientBuilder'

const SEARCH_ENDPOINT = 'https://eeokcea2t5.execute-api.us-east-1.amazonaws.com/prod'
const SEARCH_REGION = 'us-east-1'

export type Context = Readonly<MynahClient.Context>
export type SearchRequest = Readonly<MynahClient.SearchRequest>
export type SearchResponse = MynahClient.SearchResponse
export type Suggestions = MynahClient.Suggestions
export type Suggestion = MynahClient.Suggestion

export class DefaultMynahSearchClient {
    private async createSdkClient(): Promise<MynahClient> {
        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: SEARCH_REGION,
                credentials: { accessKeyId: '123', secretAccessKey: '456' },
                endpoint: SEARCH_ENDPOINT,
            } as ServiceOptions,
            undefined,
            false
        )) as MynahClient
    }

    public async search(request: MynahClient.SearchRequest): Promise<MynahClient.SearchResponse> {
        return (await this.createSdkClient()).search(request).promise()
    }
}
