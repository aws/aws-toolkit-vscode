// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials.sso

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import software.amazon.awssdk.auth.credentials.AwsCredentials
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.sso.SsoClient
import software.amazon.awssdk.services.ssooidc.model.AccessDeniedException
import software.amazon.awssdk.utils.cache.CachedSupplier
import software.amazon.awssdk.utils.cache.RefreshResult
import java.time.Duration
import java.time.Instant

/**
 * [AwsCredentialsProvider] that contains all the needed hooks to perform an end to end flow of an SSO-based credential.
 *
 * This credential provider will trigger an SSO login if required, unlike the low level SDKs.
 */
class SsoCredentialProvider(
    private val ssoAccount: String,
    private val ssoRole: String,
    private val ssoClient: SsoClient,
    private val ssoAccessTokenProvider: SsoAccessTokenProvider
) : AwsCredentialsProvider {
    private val sessionCache: CachedSupplier<SsoCredentialsHolder> = CachedSupplier.builder(this::refreshCredentials).build()

    override fun resolveCredentials(): AwsCredentials = sessionCache.get().credentials

    private fun refreshCredentials(): RefreshResult<SsoCredentialsHolder> {
        val roleCredentials = try {
            val accessToken = runBlocking(Dispatchers.IO) {
                ssoAccessTokenProvider.accessToken()
            }

            ssoClient.getRoleCredentials {
                it.accessToken(accessToken.accessToken)
                it.accountId(ssoAccount)
                it.roleName(ssoRole)
            }
        } catch (e: AccessDeniedException) {
            // OIDC access token was rejected, invalidate the cache and throw
            ssoAccessTokenProvider.invalidate()
            throw e
        }

        val awsCredentials = AwsSessionCredentials.create(
            roleCredentials.roleCredentials().accessKeyId(),
            roleCredentials.roleCredentials().secretAccessKey(),
            roleCredentials.roleCredentials().sessionToken()
        )

        val expirationTime = Instant.ofEpochMilli(roleCredentials.roleCredentials().expiration())

        val ssoCredentials =
            SsoCredentialsHolder(awsCredentials, expirationTime)

        return RefreshResult.builder(ssoCredentials)
            .staleTime(expirationTime.minus(Duration.ofMinutes(1)))
            .prefetchTime(expirationTime.minus(Duration.ofMinutes(5)))
            .build()
    }

    private data class SsoCredentialsHolder(val credentials: AwsSessionCredentials, val expirationTime: Instant)
}
