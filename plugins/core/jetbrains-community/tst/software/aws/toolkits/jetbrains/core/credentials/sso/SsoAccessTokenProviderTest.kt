// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.KStubbing
import org.mockito.kotlin.any
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.services.ssooidc.model.AuthorizationPendingException
import software.amazon.awssdk.services.ssooidc.model.CreateTokenRequest
import software.amazon.awssdk.services.ssooidc.model.CreateTokenResponse
import software.amazon.awssdk.services.ssooidc.model.InvalidClientException
import software.amazon.awssdk.services.ssooidc.model.InvalidRequestException
import software.amazon.awssdk.services.ssooidc.model.RegisterClientRequest
import software.amazon.awssdk.services.ssooidc.model.RegisterClientResponse
import software.amazon.awssdk.services.ssooidc.model.SlowDownException
import software.amazon.awssdk.services.ssooidc.model.SsoOidcException
import software.amazon.awssdk.services.ssooidc.model.StartDeviceAuthorizationRequest
import software.amazon.awssdk.services.ssooidc.model.StartDeviceAuthorizationResponse
import software.aws.toolkits.core.region.aRegionId
import software.aws.toolkits.core.utils.delegateMock
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.sso.pkce.ToolkitOAuthService
import software.aws.toolkits.jetbrains.utils.rules.SsoLoginCallbackProviderRule
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit

class SsoAccessTokenProviderTest {
    private val clock = Clock.fixed(Instant.now().truncatedTo(ChronoUnit.MILLIS), ZoneOffset.UTC)

    private val ssoUrl = aString()
    private val ssoRegion = aRegionId()
    private val clientId = aString()
    private val clientSecret = aString()

    private lateinit var ssoOidcClient: SsoOidcClient
    private lateinit var sut: SsoAccessTokenProvider
    private lateinit var ssoCache: SsoCache

    private val applicationRule = ApplicationRule()
    private val disposableRule = DisposableRule()
    private val ssoCallbackRule = SsoLoginCallbackProviderRule()

    @JvmField
    @Rule
    val ruleChain = RuleChain(applicationRule, ssoCallbackRule, disposableRule)

    @Before
    fun setUp() {
        ssoOidcClient = delegateMock()
        ssoCache = mock()

        sut = SsoAccessTokenProvider(ssoUrl, ssoRegion, ssoCache, ssoOidcClient, clock = clock)
    }

    @Test
    fun getAccessTokenWithAccessTokenCache() {
        val accessToken = DeviceAuthorizationGrantToken(ssoUrl, ssoRegion, "dummyToken", expiresAt = clock.instant())
        ssoCache.stub {
            on(
                ssoCache.loadAccessToken(ssoUrl)
            ).thenReturn(
                accessToken
            )
        }

        val accessTokenActual = runBlocking { sut.accessToken() }
        assertThat(accessTokenActual)
            .usingRecursiveComparison()
            .isEqualTo(accessToken)

        verify(ssoCache).loadAccessToken(ssoUrl)
    }

    @Test
    fun getAccessTokenWithClientRegistrationCache() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)
        setupCacheStub(expirationClientRegistration)

        ssoOidcClient.stub {
            stubStartDeviceAuthorization()
            stubCreateToken()
        }

        val accessToken = runBlocking { sut.accessToken() }
        assertThat(accessToken).usingRecursiveComparison()
            .isEqualTo(
                DeviceAuthorizationGrantToken(
                    ssoUrl,
                    ssoRegion,
                    "accessToken",
                    expiresAt = clock.instant().plusSeconds(180),
                    createdAt = clock.instant()

                )
            )

        verify(ssoOidcClient).startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
        verify(ssoOidcClient).createToken(any<CreateTokenRequest>())
        verify(ssoCache).loadAccessToken(ssoUrl)
        verify(ssoCache).loadClientRegistration(ssoRegion)
        verify(ssoCache).saveAccessToken(ssoUrl, accessToken)
    }

    @Test
    fun getAccessTokenWithoutCaches() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)
        setupCacheStub(returnValue = null)

        ssoOidcClient.stub {
            on(
                ssoOidcClient.registerClient(
                    RegisterClientRequest.builder()
                        .clientType("public")
                        .clientName("AWS IDE Plugins for JetBrains")
                        .scopes(emptyList())
                        .build()
                )
            ).thenReturn(
                RegisterClientResponse.builder()
                    .clientId(clientId)
                    .clientSecret(clientSecret)
                    .clientSecretExpiresAt(expirationClientRegistration.toEpochMilli())
                    .build()
            )

            stubStartDeviceAuthorization()
            stubCreateToken()
        }

        val accessToken = runBlocking { sut.accessToken() }
        assertThat(accessToken).usingRecursiveComparison()
            .isEqualTo(
                DeviceAuthorizationGrantToken(
                    ssoUrl,
                    ssoRegion,
                    "accessToken",
                    expiresAt = clock.instant().plusSeconds(180),
                    createdAt = clock.instant()
                )
            )

        verify(ssoOidcClient).registerClient(any<RegisterClientRequest>())
        verify(ssoOidcClient).startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
        verify(ssoOidcClient).createToken(any<CreateTokenRequest>())
        verify(ssoCache).loadAccessToken(ssoUrl)
        verify(ssoCache).loadClientRegistration(ssoRegion)
        verify(ssoCache).saveClientRegistration(eq(ssoRegion), any())
        verify(ssoCache).saveAccessToken(ssoUrl, accessToken)
    }

    @Test
    fun `initiates authorizatation_grant registration when scopes are requested in a commercial region`() {
        val sut = SsoAccessTokenProvider(ssoUrl, "us-east-1", ssoCache, ssoOidcClient, scopes = listOf("dummy:scope"), clock = clock)
        setupCacheStub(returnValue = null)

        val oauth = mock<ToolkitOAuthService>()
        ApplicationManager.getApplication().replaceService(ToolkitOAuthService::class.java, oauth, disposableRule.disposable)

        ssoOidcClient.stub {
            on(
                ssoOidcClient.registerClient(any<RegisterClientRequest>())
            ).thenReturn(
                RegisterClientResponse.builder()
                    .clientId(clientId)
                    .clientSecret(clientSecret)
                    .clientSecretExpiresAt(clock.instant().plusSeconds(180).toEpochMilli())
                    .build()
            )
        }

        // flow is not completely stubbed out
        assertThrows<Exception> { sut.accessToken() }

        verify(ssoCache).saveClientRegistration(any<PKCEClientRegistrationCacheKey>(), any())
    }

    @Test
    fun `initiates device code registration when scopes are requested in a non-commercial region`() {
        val sut = SsoAccessTokenProvider(ssoUrl, "us-gov-east-1", ssoCache, ssoOidcClient, scopes = listOf("dummy:scope"), clock = clock)
        setupCacheStub(returnValue = null)

        val oauth = mock<ToolkitOAuthService>()
        ApplicationManager.getApplication().replaceService(ToolkitOAuthService::class.java, oauth, disposableRule.disposable)

        ssoOidcClient.stub {
            on(
                ssoOidcClient.registerClient(any<RegisterClientRequest>())
            ).thenReturn(
                RegisterClientResponse.builder()
                    .clientId(clientId)
                    .clientSecret(clientSecret)
                    .clientSecretExpiresAt(clock.instant().plusSeconds(180).toEpochMilli())
                    .build()
            )
        }

        // flow is not completely stubbed out
        assertThrows<Exception> { sut.accessToken() }

        verify(ssoCache).saveClientRegistration(any<DeviceAuthorizationClientRegistrationCacheKey>(), any())
    }

    @Test
    fun getAccessTokenWithoutCachesMultiplePolls() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)

        setupCacheStub(expirationClientRegistration)

        ssoOidcClient.stub {
            stubStartDeviceAuthorization(interval = 1)
            on(
                ssoOidcClient.createToken(createTokenRequest())
            ).thenThrow(
                AuthorizationPendingException.builder().build()
            ).thenReturn(
                createTokenResponse()
            )
        }

        val startTime = Instant.now()
        val accessToken = runBlocking { sut.accessToken() }
        val callDuration = Duration.between(startTime, Instant.now())
        val creationTime = clock.instant()

        assertThat(accessToken).usingRecursiveComparison()
            .isEqualTo(
                DeviceAuthorizationGrantToken(
                    ssoUrl,
                    ssoRegion,
                    "accessToken",
                    expiresAt = clock.instant().plusSeconds(180),
                    createdAt = creationTime
                )
            )

        assertThat(callDuration.seconds).isGreaterThanOrEqualTo(1).isLessThan(2)

        verify(ssoOidcClient).startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
        verify(ssoOidcClient, times(2)).createToken(any<CreateTokenRequest>())
        verify(ssoCache).loadAccessToken(ssoUrl)
        verify(ssoCache).loadClientRegistration(ssoRegion)
        verify(ssoCache).saveAccessToken(ssoUrl, accessToken)
    }

    @Test
    fun `refresh access token updates caches`() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)
        setupCacheStub(expirationClientRegistration)

        val accessToken = DeviceAuthorizationGrantToken(ssoUrl, ssoRegion, "dummyToken", "refreshToken", clock.instant())
        ssoCache.stub {
            on(
                ssoCache.loadAccessToken(ssoUrl)
            ).thenReturn(
                accessToken
            )
        }

        ssoOidcClient.stub {
            on(
                ssoOidcClient.createToken(refreshTokenRequest())
            ).thenReturn(
                refreshTokenResponse()
            )
        }

        val refreshedToken = runBlocking { sut.refreshToken(sut.accessToken()) }

        verify(ssoCache).loadAccessToken(ssoUrl)
        verify(ssoCache).loadClientRegistration(ssoRegion)
        verify(ssoOidcClient).createToken(any<CreateTokenRequest>())
        verify(ssoCache).saveAccessToken(ssoUrl, refreshedToken)
    }

    @Test
    fun `PKCE refresh access token saves PKCE token`() {
        val sut = SsoAccessTokenProvider(ssoUrl, "us-east-1", ssoCache, ssoOidcClient, scopes = listOf("dummy:scope"), clock = clock)

        val expirationClientRegistration = clock.instant().plusSeconds(120)
        setupCacheStub(expirationClientRegistration)

        val accessToken = PKCEAuthorizationGrantToken(ssoUrl, ssoRegion, "dummyToken", "refreshToken", clock.instant(), clock.instant())
        ssoCache.stub {
            on(
                ssoCache.loadAccessToken(any<PKCEAccessTokenCacheKey>())
            ).thenReturn(
                accessToken
            )

            on(
                ssoCache.loadClientRegistration(any<PKCEClientRegistrationCacheKey>())
            ).thenReturn(
                PKCEClientRegistration(
                    clientType = "public",
                    redirectUris = listOf("uri"),
                    grantTypes = listOf("grant"),
                    issuerUrl = ssoUrl,
                    region = ssoRegion,
                    scopes = listOf("dummy:scope"),
                    clientId = clientId,
                    clientSecret = clientSecret,
                    expiresAt = clock.instant()
                )
            )
        }

        ssoOidcClient.stub {
            on(
                ssoOidcClient.createToken(refreshTokenRequest())
            ).thenReturn(
                refreshTokenResponse()
            )
        }

        val refreshedToken = runBlocking { sut.refreshToken(sut.accessToken()) }

        verify(ssoCache).loadAccessToken(any<PKCEAccessTokenCacheKey>())
        verify(ssoCache).loadClientRegistration(any<PKCEClientRegistrationCacheKey>())
        verify(ssoOidcClient).createToken(any<CreateTokenRequest>())
        verify(ssoCache).saveAccessToken(any<PKCEAccessTokenCacheKey>(), eq(refreshedToken))
    }

    @Test
    fun exceptionStopsPolling() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)

        setupCacheStub(expirationClientRegistration)

        ssoOidcClient.stub {
            stubStartDeviceAuthorization()
            stubCreateToken(throws = true)
        }

        assertThatThrownBy { runBlocking { sut.accessToken() } }.isInstanceOf(InvalidRequestException::class.java)

        verify(ssoOidcClient).startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
        verify(ssoOidcClient).createToken(any<CreateTokenRequest>())
        verify(ssoCache).loadAccessToken(ssoUrl)
        verify(ssoCache).loadClientRegistration(ssoRegion)
    }

    @Test
    fun backOffTimeIsRespected() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)
        setupCacheStub(expirationClientRegistration)

        ssoOidcClient.stub {
            stubStartDeviceAuthorization(interval = 1)

            on(
                ssoOidcClient.createToken(createTokenRequest())
            ).thenThrow(
                SlowDownException.builder().build()
            ).thenReturn(
                createTokenResponse()
            )
        }

        val startTime = Instant.now()
        val accessToken = runBlocking { sut.accessToken() }
        val callDuration = Duration.between(startTime, Instant.now())

        assertThat(accessToken).usingRecursiveComparison()
            .isEqualTo(
                DeviceAuthorizationGrantToken(
                    ssoUrl,
                    ssoRegion,
                    "accessToken",
                    expiresAt = clock.instant().plusSeconds(180),
                    createdAt = clock.instant()
                )
            )

        assertThat(callDuration).isGreaterThan(Duration.ofSeconds(5))

        verify(ssoCache).saveAccessToken(ssoUrl, accessToken)

        verify(ssoOidcClient).startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
        verify(ssoOidcClient, times(2)).createToken(any<CreateTokenRequest>())
        verify(ssoCache).loadAccessToken(ssoUrl)
        verify(ssoCache).loadClientRegistration(ssoRegion)
        verify(ssoCache).saveAccessToken(ssoUrl, accessToken)
    }

    @Test
    fun failToGetClientRegistrationLeadsToError() {
        setupCacheStub(returnValue = null)

        ssoOidcClient.stub {
            on(
                ssoOidcClient.registerClient(any<RegisterClientRequest>())
            ).thenThrow(
                SsoOidcException.builder().build()
            )
        }

        assertThatThrownBy { runBlocking { sut.accessToken() } }.isInstanceOf(SsoOidcException::class.java)

        verify(ssoOidcClient).registerClient(any<RegisterClientRequest>())
        verify(ssoCache).loadAccessToken(ssoUrl)
        verify(ssoCache).loadClientRegistration(ssoRegion)
    }

    @Test
    fun invalidClientRegistrationClearsTheCache() {
        setupCacheStub(Instant.now(clock))

        ssoOidcClient.stub {
            on(
                ssoOidcClient.startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
            ).thenThrow(
                InvalidClientException.builder().build()
            )
        }

        assertThatThrownBy { runBlocking { sut.accessToken() } }.isInstanceOf(InvalidClientException::class.java)

        verify(ssoCache).invalidateClientRegistration(ssoRegion)
    }

    @Test
    fun invalidateClearsTheCache() {
        sut.invalidate()

        verify(ssoCache).invalidateAccessToken(ssoUrl)
    }

    private fun setupCacheStub(expirationClientRegistration: Instant) {
        setupCacheStub(DeviceAuthorizationClientRegistration(clientId, clientSecret, expirationClientRegistration))
    }

    private fun setupCacheStub(returnValue: ClientRegistration?) {
        ssoCache.stub {
            on(
                ssoCache.loadAccessToken(ssoUrl)
            ).thenReturn(
                null
            )

            on(
                ssoCache.loadClientRegistration(ssoRegion)
            ).thenReturn(
                returnValue
            )
        }
    }

    private fun KStubbing<SsoOidcClient>.stubStartDeviceAuthorization(interval: Int? = null) {
        on(
            ssoOidcClient.startDeviceAuthorization(
                StartDeviceAuthorizationRequest.builder()
                    .clientId(clientId)
                    .clientSecret(clientSecret)
                    .startUrl(ssoUrl)
                    .build()
            )
        ).thenReturn(
            StartDeviceAuthorizationResponse.builder()
                .expiresIn(120)
                .deviceCode("dummyCode")
                .userCode("dummyUserCode")
                .verificationUri("someUrl")
                .verificationUriComplete("someUrlComplete")
                .apply { if (interval != null) interval(interval) }
                .build()
        )
    }

    private fun KStubbing<SsoOidcClient>.stubCreateToken(throws: Boolean = false) {
        on(
            ssoOidcClient.createToken(createTokenRequest())
        ).apply {
            if (throws) {
                thenThrow(InvalidRequestException.builder().build())
            } else {
                thenReturn(createTokenResponse())
            }
        }
    }

    private fun createTokenRequest(): CreateTokenRequest = CreateTokenRequest.builder()
        .clientId(clientId)
        .clientSecret(clientSecret)
        .deviceCode("dummyCode")
        .grantType("urn:ietf:params:oauth:grant-type:device_code")
        .build()

    private fun createTokenResponse(): CreateTokenResponse = CreateTokenResponse.builder()
        .accessToken("accessToken")
        .expiresIn(180)
        .build()

    private fun refreshTokenRequest(): CreateTokenRequest = CreateTokenRequest.builder()
        .clientId(clientId)
        .clientSecret(clientSecret)
        .refreshToken("refreshToken")
        .grantType("refresh_token")
        .build()

    private fun refreshTokenResponse(): CreateTokenResponse = CreateTokenResponse.builder()
        .accessToken("accessToken2")
        .refreshToken("refreshToken2")
        .expiresIn(180)
        .build()
}
