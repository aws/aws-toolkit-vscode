/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ext } from '../extensionGlobals'
import { getLogger } from '../logger'

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
