// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.telemetry

import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.cognitoidentity.CognitoIdentityClient
import software.amazon.awssdk.services.cognitoidentity.model.Credentials
import software.amazon.awssdk.services.cognitoidentity.model.GetCredentialsForIdentityRequest
import software.amazon.awssdk.services.cognitoidentity.model.GetIdRequest
import software.amazon.awssdk.utils.cache.CachedSupplier
import software.amazon.awssdk.utils.cache.NonBlocking
import software.amazon.awssdk.utils.cache.RefreshResult
import software.aws.toolkits.core.telemetry.CachedIdentityStorage
import java.time.temporal.ChronoUnit

/**
 * [AwsCredentialsProvider] implementation that uses the Amazon Cognito Identity
 * service to create temporary, short-lived sessions to use for authentication
 *
 * @constructor Creates a new AwsCredentialsProvider that uses credentials from a Cognito Identity pool.
 * @property identityPool The name of the pool to create users from
 * @param region The region associated with this Cognito pool
 * @param cacheStorage A storage solution to cache an identity ID, disabled if null
 */
class AWSCognitoCredentialsProvider(
    private val identityPool: String,
    private val cognitoClient: CognitoIdentityClient,
    cacheStorage: CachedIdentityStorage? = null
) : AwsCredentialsProvider {
    private val identityIdProvider = AwsCognitoIdentityProvider(cognitoClient, identityPool, cacheStorage)
    private val cacheSupplier = CachedSupplier.builder(this::updateCognitoCredentials)
        .prefetchStrategy(NonBlocking("Cognito Identity Credential Refresh"))
        .build()

    override fun resolveCredentials(): AwsCredentials = cacheSupplier.get()

    private fun updateCognitoCredentials(): RefreshResult<AwsSessionCredentials> {
        val credentialsForIdentity = credentialsForIdentity()
        val sessionCredentials = AwsSessionCredentials.create(
            credentialsForIdentity.accessKeyId(),
            credentialsForIdentity.secretKey(),
            credentialsForIdentity.sessionToken()
        )
        val actualExpiration = credentialsForIdentity.expiration()

        return RefreshResult.builder(sessionCredentials)
            .staleTime(actualExpiration.minus(1, ChronoUnit.MINUTES))
            .prefetchTime(actualExpiration.minus(5, ChronoUnit.MINUTES))
            .build()
    }

    private fun credentialsForIdentity(): Credentials {
        val identityId = identityIdProvider.identityId
        val request = GetCredentialsForIdentityRequest.builder().identityId(identityId).build()

        return cognitoClient.getCredentialsForIdentity(request).credentials()
    }
}

private class AwsCognitoIdentityProvider(
    private val cognitoClient: CognitoIdentityClient,
    private val identityPoolId: String,
    private val cacheStorage: CachedIdentityStorage? = null
) {
    val identityId: String by lazy {
        loadFromCache() ?: createNewIdentity()
    }

    private fun loadFromCache(): String? = cacheStorage?.loadIdentity(identityPoolId)

    private fun createNewIdentity(): String {
        val request = GetIdRequest.builder().identityPoolId(identityPoolId).build()
        val newIdentityId = cognitoClient.getId(request).identityId()

        cacheStorage?.storeIdentity(identityPoolId, newIdentityId)

        return newIdentityId
    }
}
