/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as AWS from 'aws-sdk'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'
import { getLogger } from '../../../shared/logger/logger'
import { CredentialsProvider } from '../../../auth/providers/credentials'

/**
 * Adapts a ConnectionCredentialsProvider (SDK v3) to work with SDK v2's CredentialProviderChain
 */
export function adaptConnectionCredentialsProvider(
    connectionCredentialsProvider: ConnectionCredentialsProvider | CredentialsProvider
): AWS.CredentialProviderChain {
    const provider = () => {
        // Create SDK v2 Credentials that will resolve the provider when needed
        const credentials = new AWS.Credentials({
            accessKeyId: '',
            secretAccessKey: '',
            sessionToken: '',
        })

        // Override the get method to use the connection credentials provider
        credentials.get = (callback) => {
            getLogger().debug('Attempting to get credentials from ConnectionCredentialsProvider')

            connectionCredentialsProvider
                .getCredentials()
                .then((creds) => {
                    getLogger().debug('Successfully got credentials')

                    credentials.accessKeyId = creds.accessKeyId as string
                    credentials.secretAccessKey = creds.secretAccessKey as string
                    credentials.sessionToken = creds.sessionToken as string
                    credentials.expireTime = creds.expiration as Date
                    callback()
                })
                .catch((err) => {
                    getLogger().debug(`Failed to get credentials: ${err}`)

                    callback(err)
                })
        }

        // Override needsRefresh to delegate to the connection credentials provider
        credentials.needsRefresh = () => {
            return true // Always call refresh, this is okay because there is caching existing in credential provider
        }

        // Override refresh to use the connection credentials provider
        credentials.refresh = (callback) => {
            credentials.get(callback)
        }

        return credentials
    }

    return new AWS.CredentialProviderChain([provider])
}
