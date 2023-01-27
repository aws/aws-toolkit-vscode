/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from 'aws-sdk'
import apiConfig = require('./service-2.json')
import globals from '../../shared/extensionGlobals'
import * as AutocompleteClient from './autocompleteclient'
import { ServiceOptions } from '../../shared/awsClientBuilder'

const AutocompleteEndpoint = 'https://g75syrp43k.execute-api.us-east-1.amazonaws.com/prod'
const Region = 'us-east-1'

export type Context = Readonly<AutocompleteClient.Context>
export type AutocompleteRequest = Readonly<AutocompleteClient.AutocompleteRequest>
export type AutocompleteResponse = AutocompleteClient.AutocompleteResponse
export type Suggestions = AutocompleteClient.Suggestions
export type Suggestion = AutocompleteClient.Suggestion

export class DefaultAutocompleteClient {
    private async createSdkClient(): Promise<AutocompleteClient> {
        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: Region,
                credentials: { accessKeyId: '123', secretAccessKey: '456' },
                endpoint: AutocompleteEndpoint,
            } as ServiceOptions,
            undefined,
            false
        )) as AutocompleteClient
    }

    public async autocomplete(
        request: AutocompleteClient.AutocompleteRequest
    ): Promise<AutocompleteClient.AutocompleteResponse> {
        return (await this.createSdkClient()).autocomplete(request).promise()
    }
}
