/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Service } from 'aws-sdk'
import apiConfig = require('./service-2.json')
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import globals from '../../../shared/extensionGlobals'
import * as ConsolasClient from './consolasclient'
import { ConsolasConstants } from '../models/constants'

export type ConsolasProgLang = Readonly<ConsolasClient.ProgrammingLanguage>
export type ConsolasContextInfo = Readonly<ConsolasClient.ContextInfo>
export type ConsolasFileContext = Readonly<ConsolasClient.FileContext>
export type ConsolasGenerateRecommendationsReq = Readonly<ConsolasClient.GenerateRecommendationsRequest>

export class DefaultConsolasClient {
    public async createSdkClient(): Promise<ConsolasClient> {
        return (await globals.sdkClientBuilder.createAwsService(
            Service,
            {
                apiConfig: apiConfig,
                region: ConsolasConstants.REGION,
                credentials: await globals.awsContext.getCredentials(),
                endpoint: ConsolasConstants.PROD_ENDPOINT,
            } as ServiceConfigurationOptions,
            undefined,
            false
        )) as ConsolasClient
    }
}
