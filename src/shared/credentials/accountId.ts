/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'
import { EnvironmentVariables } from '../../shared/environmentVariables'

/**
 * Looks up the Credentials associated Account ID with its own STS Client.
 */
export async function getAccountId(credentials: AWS.Credentials, region: string): Promise<string | undefined> {
    try {
        getLogger().verbose(`Getting AccountId from region ${region}`)

        const sts = ext.toolkitClientBuilder.createStsClient(region, {
            credentials: credentials,
        })

        const response = await sts.getCallerIdentity()

        return response.Account
    } catch (err) {
        getLogger().error('Error getting AccountId: %O', err as Error)

        return undefined
    }
}

/**
 * Temporary workaround for missing credentials bug.
 * TODO: Remove this function when migrated over to V3 of the SDK
 */
export async function getAccountIdHack(credentials: AWS.Credentials, region: string): Promise<string | undefined> {
    // In V2 of the AWS JS SDK, the STS client tries to parse from the credentials file even
    // if it doesn't exist, throwing an uncaught exception.
    // This is because it doesn't check for the region we passed to it...
    // Instead we have to set an enviromental variable
    const env = process.env as EnvironmentVariables
    const tmp = env.AWS_REGION
    env.AWS_REGION = env.AWS_REGION ?? region

    const accountId: string | undefined = await getAccountId(credentials, region)

    if (tmp === undefined) {
        delete env.AWS_REGION // Delete it to prevent side effects
    } else {
        env.AWS_REGION = tmp
    }

    return accountId
}
