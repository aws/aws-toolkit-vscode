/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CognitoIdentity, CognitoIdentityCredentials } from 'aws-sdk'
import * as CodeWhispererConstants from '../models/constants'
import globals from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'

const cognitoIdKey = 'cognitoID'

export const getCognitoCredentials = async (): Promise<CognitoIdentityCredentials> => {
    const region = CodeWhispererConstants.region
    try {
        // grab Cognito identityId
        const poolId = CodeWhispererConstants.identityPoolID
        const identityMapJson = globals.context.globalState.get<string>(cognitoIdKey, '[]')

        const identityMap = new Map<string, string>(JSON.parse(identityMapJson) as Iterable<[string, string]>)
        let identityId = identityMap.get(poolId)

        // if we don't have an identity, get one
        if (!identityId) {
            identityId = await getIdentityFromIdentityPool()

            // save it
            identityMap.set(poolId, identityId)
            await globals.context.globalState.update(cognitoIdKey, JSON.stringify(Array.from(identityMap.entries())))
        }

        const credentials = new CognitoIdentityCredentials({ IdentityId: identityId }, { region })
        return credentials
    } catch (err) {
        getLogger().error(`Failed to initialize Cognito identity for CodeWhisperer: ${err} in region: ${region}`)
        return Promise.reject(`Failed to initialize Cognito identity for CodeWhisperer: ${err}`)
    }
}

const getIdentityFromIdentityPool = async (): Promise<string> => {
    try {
        const res = await new CognitoIdentity({
            region: CodeWhispererConstants.region,
        })
            .getId({
                IdentityPoolId: CodeWhispererConstants.identityPoolID,
            })
            .promise()

        const err = res.$response.error
        if (err) {
            getLogger().error(`Error getting identity from Cognito. Request ID: ${res.$response.requestId}`)
            return Promise.reject(`SDK error: ${err}`)
        }

        const { IdentityId } = res

        if (!IdentityId) {
            getLogger().error(`Identity ID was null from Cognito. Request ID: ${res.$response.requestId}`)
            return Promise.reject('missing Identity ID')
        }

        return IdentityId
    } catch (err) {
        return Promise.reject(`Failed to get new Cognito identity for CodeWhisperer: ${err}`)
    }
}
