// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.intellij.openapi.components.service
import com.intellij.openapi.progress.ProgressManager
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.auth.token.credentials.SdkTokenProvider
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.services.ssooidc.model.AuthorizationPendingException
import software.amazon.awssdk.services.ssooidc.model.CreateTokenResponse
import software.amazon.awssdk.services.ssooidc.model.InvalidClientException
import software.amazon.awssdk.services.ssooidc.model.InvalidRequestException
import software.amazon.awssdk.services.ssooidc.model.SlowDownException
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.utils.assertIsNonDispatchThread
import software.aws.toolkits.jetbrains.utils.sleepWithCancellation
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import software.aws.toolkits.telemetry.CredentialSourceId
import software.aws.toolkits.telemetry.Result
import java.time.Clock
import java.time.Duration
import java.time.Instant

/**
 * Takes care of creating/refreshing the SSO access token required to fetch SSO-based credentials.
 */
class SsoAccessTokenProvider(
    private val ssoUrl: String,
    private val ssoRegion: String,
    private val cache: SsoCache,
    private val client: SsoOidcClient,
    private val scopes: List<String> = emptyList(),
    private val clock: Clock = Clock.systemUTC()
) : SdkTokenProvider {

    @TestOnly
    var authorizationCreationTime = Instant.now(clock)

    private val clientRegistrationCacheKey by lazy {
        ClientRegistrationCacheKey(
            startUrl = ssoUrl,
            scopes = scopes,
            region = ssoRegion
        )
    }
    internal val accessTokenCacheKey by lazy {
        AccessTokenCacheKey(
            connectionId = ssoRegion,
            startUrl = ssoUrl,
            scopes = scopes
        )
    }

    override fun resolveToken() = accessToken()

    fun accessToken(): AccessToken {
        assertIsNonDispatchThread()

        loadAccessToken()?.let {
            return it
        }

        val token = pollForToken()

        saveAccessToken(token)

        return token
    }

    private fun registerClient(): ClientRegistration {
        loadClientRegistration()?.let {
            return it
        }

        // Based on botocore: https://github.com/boto/botocore/blob/5dc8ee27415dc97cfff75b5bcfa66d410424e665/botocore/utils.py#L1753
        val registerResponse = client.registerClient {
            it.clientType(CLIENT_REGISTRATION_TYPE)
            it.scopes(scopes)
            it.clientName("AWS Toolkit for JetBrains")
        }

        val registeredClient = ClientRegistration(
            registerResponse.clientId(),
            registerResponse.clientSecret(),
            Instant.ofEpochSecond(registerResponse.clientSecretExpiresAt())
        )

        saveClientRegistration(registeredClient)

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
            invalidateClientRegistration()
            throw e
        }

        authorizationCreationTime = Instant.now(clock)

        return Authorization(
            authorizationResponse.deviceCode(),
            authorizationResponse.userCode(),
            authorizationResponse.verificationUri(),
            authorizationResponse.verificationUriComplete(),
            Instant.now(clock).plusSeconds(authorizationResponse.expiresIn().toLong()),
            authorizationResponse.interval()?.toLong()
                ?: DEFAULT_INTERVAL_SECS,
            authorizationCreationTime
        )
    }

    private fun pollForToken(): AccessToken {
        val onPendingToken = service<SsoLoginCallbackProvider>().getProvider(ssoUrl)
        val progressIndicator = ProgressManager.getInstance().progressIndicator
        val registration = registerClient()
        val authorization = authorizeClient(registration)

        progressIndicator?.text2 = message("aws.sso.signing.device.waiting", authorization.userCode)
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

                return tokenResponse.toAccessToken(authorization.createdAt)
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
            val tokenCreationTime = currentToken.createdAt

            if (tokenCreationTime != Instant.EPOCH) {
                val sessionDuration = Duration.between(Instant.now(clock), tokenCreationTime)
                val credentialSourceId = if (currentToken.startUrl == SONO_URL) CredentialSourceId.AwsId else CredentialSourceId.IamIdentityCenter
                AwsTelemetry.refreshCredentials(
                    project = null,
                    Result.Failed,
                    sessionDuration = sessionDuration.toHours().toInt(),
                    credentialSourceId = credentialSourceId,
                    reason = "Null refresh token"
                )
            }

            throw InvalidRequestException.builder().message("Requested token refresh, but refresh token was null").build()
        }

        val registration = loadClientRegistration() ?: throw InvalidClientException.builder().message("Unable to load client registration").build()

        val newToken = client.createToken {
            it.clientId(registration.clientId)
            it.clientSecret(registration.clientSecret)
            it.grantType(REFRESH_GRANT_TYPE)
            it.refreshToken(currentToken.refreshToken)
        }

        val token = newToken.toAccessToken(currentToken.createdAt)
        saveAccessToken(token)

        return token
    }

    fun invalidate() {
        if (scopes.isEmpty()) {
            cache.invalidateAccessToken(ssoUrl)
        } else {
            cache.invalidateAccessToken(accessTokenCacheKey)
        }
    }

    private fun loadClientRegistration(): ClientRegistration? = if (scopes.isEmpty()) {
        cache.loadClientRegistration(ssoRegion)?.let {
            return it
        }
    } else {
        cache.loadClientRegistration(clientRegistrationCacheKey)?.let {
            return it
        }
    }

    private fun saveClientRegistration(registration: ClientRegistration) {
        if (scopes.isEmpty()) {
            cache.saveClientRegistration(ssoRegion, registration)
        } else {
            cache.saveClientRegistration(clientRegistrationCacheKey, registration)
        }
    }

    private fun invalidateClientRegistration() {
        if (scopes.isEmpty()) {
            cache.invalidateClientRegistration(ssoRegion)
        } else {
            cache.invalidateClientRegistration(clientRegistrationCacheKey)
        }
    }

    private fun loadAccessToken(): AccessToken? = if (scopes.isEmpty()) {
        cache.loadAccessToken(ssoUrl)?.let {
            return it
        }
    } else {
        cache.loadAccessToken(accessTokenCacheKey)?.let {
            return it
        }
    }

    private fun saveAccessToken(token: AccessToken) {
        if (scopes.isEmpty()) {
            cache.saveAccessToken(ssoUrl, token)
        } else {
            cache.saveAccessToken(accessTokenCacheKey, token)
        }
    }

    private fun CreateTokenResponse.toAccessToken(creationTime: Instant): AccessToken {
        val expirationTime = Instant.now(clock).plusSeconds(expiresIn().toLong())

        return AccessToken(
            startUrl = ssoUrl,
            region = ssoRegion,
            accessToken = accessToken(),
            refreshToken = refreshToken(),
            expiresAt = expirationTime,
            createdAt = creationTime
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
