// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.intellij.openapi.progress.ProgressManager
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.services.ssooidc.model.AuthorizationPendingException
import software.amazon.awssdk.services.ssooidc.model.CreateTokenResponse
import software.amazon.awssdk.services.ssooidc.model.InvalidClientException
import software.amazon.awssdk.services.ssooidc.model.InvalidRequestException
import software.amazon.awssdk.services.ssooidc.model.SlowDownException
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread
import software.aws.toolkits.jetbrains.utils.sleepWithCancellation
import java.time.Clock
import java.time.Duration
import java.time.Instant

/**
 * Takes care of creating/refreshing the SSO access token required to fetch SSO-based credentials.
 */
class SsoAccessTokenProvider(
    private val ssoUrl: String,
    private val ssoRegion: String,
    private val onPendingToken: SsoLoginCallback,
    private val cache: SsoCache,
    private val client: SsoOidcClient,
    private val scopes: List<String> = emptyList(),
    private val clock: Clock = Clock.systemUTC()
) {
    fun accessToken(): AccessToken {
        assertIsNonDispatchThread()

        cache.loadAccessToken(ssoUrl)?.let {
            return it
        }

        val token = pollForToken()

        cache.saveAccessToken(ssoUrl, token)

        return token
    }

    private fun registerClient(): ClientRegistration {
        cache.loadClientRegistration(ssoRegion)?.let {
            return it
        }

        // Based on botocore: https://github.com/boto/botocore/blob/5dc8ee27415dc97cfff75b5bcfa66d410424e665/botocore/utils.py#L1753
        val registerResponse = client.registerClient {
            it.clientType(CLIENT_REGISTRATION_TYPE)
            it.scopes(scopes)
            it.clientName("aws-toolkit-jetbrains-${Instant.now(clock)}")
        }

        val registeredClient = ClientRegistration(
            registerResponse.clientId(),
            registerResponse.clientSecret(),
            Instant.ofEpochSecond(registerResponse.clientSecretExpiresAt())
        )

        cache.saveClientRegistration(ssoRegion, registeredClient)

        return registeredClient
    }

    private fun authorizeClient(clientId: ClientRegistration): Authorization {
        // Should not be cached, only good for 1 token and short lived
        val authorizationResponse = try {
            client.startDeviceAuthorization {
                it.startUrl(ssoUrl)
                it.clientId(clientId.clientId)
                it.clientSecret(clientId.clientSecret)
            }
        } catch (e: InvalidClientException) {
            cache.invalidateClientRegistration(ssoRegion)
            throw e
        }

        return Authorization(
            authorizationResponse.deviceCode(),
            authorizationResponse.userCode(),
            authorizationResponse.verificationUri(),
            authorizationResponse.verificationUriComplete(),
            Instant.now(clock).plusSeconds(authorizationResponse.expiresIn().toLong()),
            authorizationResponse.interval()?.toLong()
                ?: DEFAULT_INTERVAL_SECS
        )
    }

    private fun pollForToken(): AccessToken {
        val progressIndicator = ProgressManager.getInstance().progressIndicator
        val registration = registerClient()
        val authorization = authorizeClient(registration)

        onPendingToken.tokenPending(authorization)

        var backOffTime = Duration.ofSeconds(authorization.pollInterval)

        while (true) {
            try {
                val tokenResponse = client.createToken {
                    it.clientId(registration.clientId)
                    it.clientSecret(registration.clientSecret)
                    it.grantType(DEVICE_GRANT_TYPE)
                    it.deviceCode(authorization.deviceCode)
                }

                onPendingToken.tokenRetrieved()

                return tokenResponse.toAccessToken()
            } catch (e: SlowDownException) {
                backOffTime = backOffTime.plusSeconds(SLOW_DOWN_DELAY_SECS)
            } catch (e: AuthorizationPendingException) {
                // Do nothing, keep polling
            } catch (e: Exception) {
                onPendingToken.tokenRetrievalFailure(e)
                throw e
            }

            sleepWithCancellation(backOffTime, progressIndicator)
        }
    }

    fun refreshToken(currentToken: AccessToken): AccessToken {
        if (currentToken.refreshToken == null) {
            throw InvalidRequestException.builder().build()
        }

        val registration = cache.loadClientRegistration(ssoRegion) ?: throw InvalidClientException.builder().build()

        val newToken = client.createToken {
            it.clientId(registration.clientId)
            it.clientSecret(registration.clientSecret)
            it.grantType(REFRESH_GRANT_TYPE)
            it.refreshToken(currentToken.refreshToken)
        }

        val token = newToken.toAccessToken()
        cache.saveAccessToken(ssoUrl, token)

        return token
    }

    fun invalidate() {
        cache.invalidateAccessToken(ssoUrl)
    }

    private fun CreateTokenResponse.toAccessToken(): AccessToken {
        val expirationTime = Instant.now(clock).plusSeconds(expiresIn().toLong())

        return AccessToken(
            startUrl = ssoUrl,
            region = ssoRegion,
            accessToken = accessToken(),
            refreshToken = refreshToken(),
            expiresAt = expirationTime
        )
    }

    private companion object {
        const val CLIENT_REGISTRATION_TYPE = "public"
        const val DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code"
        const val REFRESH_GRANT_TYPE = "refresh_token"

        // Default number of seconds to poll for token, https://tools.ietf.org/html/draft-ietf-oauth-device-flow-15#section-3.5
        const val DEFAULT_INTERVAL_SECS = 5L
        const val SLOW_DOWN_DELAY_SECS = 5L
    }
}
