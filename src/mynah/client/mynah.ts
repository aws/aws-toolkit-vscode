/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from 'aws-sdk'
import apiConfig = require('./service-2.json')
import globals from '../../shared/extensionGlobals'
import * as MynahClient from './mynahclient'
import { ServiceOptions } from '../../shared/awsClientBuilder'

const SearchEndpoint = 'https://zip88rz00d.execute-api.us-east-1.amazonaws.com/prod'
const SearchRegion = 'us-east-1'
const MynahAwsServiceTimeout = 3000

export type Context = Readonly<MynahClient.Context>
export type SearchRequest = Readonly<MynahClient.SearchRequest>
export type SearchResponse = MynahClient.SearchResponse
export type Suggestions = MynahClient.Suggestions
export type Suggestion = MynahClient.Suggestion

export type ApiDocsSearchRequest = Readonly<MynahClient.ApiDocsSearchRequest>
export type ApiDocsSearchResponse = Readonly<MynahClient.ApiDocsSearchResponse>
export type ApiDocsSuggestions = MynahClient.ApiDocsSuggestions
export type ApiDocsSuggestion = MynahClient.ApiDocsSuggestion

export class DefaultMynahSearchClient {
    private async createSdkClient(): Promise<MynahClient> {
        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: SearchRegion,
                credentials: { accessKeyId: '123', secretAccessKey: '456' },
                endpoint: SearchEndpoint,
                httpOptions: {
                    timeout: MynahAwsServiceTimeout,
                },
            } as ServiceOptions,
            undefined,
            false
        )) as MynahClient
    }

    public async search(request: MynahClient.SearchRequest): Promise<MynahClient.SearchResponse> {
        return (await this.createSdkClient()).search(request).promise()
    }
    public async apiDocsSearch(request: MynahClient.ApiDocsSearchRequest): Promise<MynahClient.ApiDocsSearchResponse> {
        return (await this.createSdkClient()).apiDocsSearch(request).promise()
    }
}
