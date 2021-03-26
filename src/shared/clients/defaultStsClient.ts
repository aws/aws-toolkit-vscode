/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SystemUtilities } from '../../shared/systemUtilities'
import { STS } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { ext } from '../extensionGlobals'
import { StsClient } from './stsClient'
import { EnvironmentVariables } from '../../shared/environmentVariables'
import { getConfigFilename, getCredentialsFilename } from '../../credentials/sharedCredentials'

export class DefaultStsClient implements StsClient {
    public constructor(
        public readonly regionCode: string,
        private readonly credentials?: ServiceConfigurationOptions
    ) {}

    public async getCallerIdentity(): Promise<STS.GetCallerIdentityResponse> {
        const sdkClient = await this.createSdkClient()
        const response = await sdkClient.getCallerIdentity().promise()

        return response
    }

    private async createSdkClient(): Promise<STS> {
        // In V2 of the AWS JS SDK, the STS client tries to parse from the credentials file even
        // if it doesn't exist, throwing an uncaught exception.
        // As a workaround, we set the environment variable for the credentials file to instead point
        // to the config file. To prevent any side-effects in the rest of the toolkit, we'll reset
        // the variable back to the way it was.
        // TODO: Remove this hack when the toolkit migrates to version 3 of the SDK
        const env: EnvironmentVariables = process.env as EnvironmentVariables
        const tmp: string | undefined = env.AWS_SHARED_CREDENTIALS_FILE

        if (!(await SystemUtilities.fileExists(getCredentialsFilename()))) {
            env.AWS_SHARED_CREDENTIALS_FILE = env.AWS_SHARED_CREDENTIALS_FILE ?? getConfigFilename()
        }

        const client: STS = await ext.sdkClientBuilder.createAndConfigureServiceClient(
            options => {
                options.stsRegionalEndpoints = 'regional'
                return new STS(options)
            },
            this.credentials,
            this.regionCode
        )

        // Seting the environment variable as undefined just sets it as the string "undefined"
        // Have to delete it if it didn't exist before
        if (tmp === undefined) {
            delete env.AWS_SHARED_CREDENTIALS_FILE
        } else {
            env.AWS_SHARED_CREDENTIALS_FILE = tmp
        }

        return client
    }
}
