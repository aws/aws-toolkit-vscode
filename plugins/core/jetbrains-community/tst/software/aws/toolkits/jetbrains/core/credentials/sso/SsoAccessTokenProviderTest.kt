// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.registry.Registry
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
import org.mockito.kotlin.argThat
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.amazon.awssdk.awscore.exception.AwsServiceException
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
import software.aws.toolkits.jetbrains.core.credentials.sono.IDENTITY_CENTER_ROLE_ACCESS_SCOPE
import software.aws.toolkits.jetbrains.core.credentials.sso.pkce.ToolkitOAuthService
import software.aws.toolkits.jetbrains.utils.rules.RegistryRule
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
    private val registryRule = RegistryRule("aws.dev.useDAG", true)

    @JvmField
    @Rule
    val ruleChain = RuleChain(applicationRule, registryRule, ssoCallbackRule, disposableRule)

    @Before
    fun setUp() {
        ssoOidcClient = delegateMock()
        ssoCache = mock()

        sut = SsoAccessTokenProvider(ssoUrl, ssoRegion, ssoCache, ssoOidcClient, scopes = listOf(IDENTITY_CENTER_ROLE_ACCESS_SCOPE), clock = clock)
    }

    @Test
    fun getAccessTokenWithAccessTokenCache() {
        val accessToken = DeviceAuthorizationGrantToken(ssoUrl, ssoRegion, "dummyToken", expiresAt = clock.instant())
        ssoCache.stub {
            on(
                ssoCache.loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
            ).thenReturn(
                accessToken
            )
        }

        val accessTokenActual = runBlocking { sut.accessToken() }
        assertThat(accessTokenActual)
            .usingRecursiveComparison()
            .isEqualTo(accessToken)

        verify(ssoCache).loadAccessToken(any<DeviceGrantAccessTokenCacheKey>())
    }

    @Test
    fun `get device access token with client registration cache`() {
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
        verify(ssoCache).loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
        verify(ssoCache).loadClientRegistration(argThat { region == ssoRegion })
        verify(ssoCache).saveAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl }, eq(accessToken))
    }

    @Test
    fun `get device access token without caches`() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)
        setupCacheStub(returnValue = null)

        ssoOidcClient.stub {
            on(
                ssoOidcClient.registerClient(
                    RegisterClientRequest.builder()
                        .clientType("public")
                        .clientName("AWS IDE Plugins for JetBrains")
                        .scopes(listOf(IDENTITY_CENTER_ROLE_ACCESS_SCOPE))
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
        verify(ssoCache).loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
        verify(ssoCache).loadClientRegistration(argThat<DeviceAuthorizationClientRegistrationCacheKey> { region == ssoRegion })
        verify(ssoCache).saveClientRegistration(argThat<DeviceAuthorizationClientRegistrationCacheKey> { region == ssoRegion }, any())
        verify(ssoCache).saveAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl }, eq(accessToken))
    }

    @Test
    fun `initiates authorizatation_grant registration when requested in a commercial region`() {
        setPkceTrue()
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
    fun `initiates device code registration when requested in a non-commercial region`() {
        setPkceTrue()
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

        verify(ssoCache).saveClientRegistration(any(), any())
    }

    @Test
    fun `get device access token without caches and multiple polls`() {
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
        verify(ssoCache).loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
        verify(ssoCache).loadClientRegistration(argThat<DeviceAuthorizationClientRegistrationCacheKey> { region == ssoRegion })
        verify(ssoCache).saveAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl }, eq(accessToken))
    }

    @Test
    fun `refresh access token updates caches`() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)
        setupCacheStub(expirationClientRegistration)

        val accessToken = DeviceAuthorizationGrantToken(ssoUrl, ssoRegion, "dummyToken", "refreshToken", clock.instant())
        ssoCache.stub {
            on(
                ssoCache.loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
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

        verify(ssoCache).loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
        verify(ssoCache).loadClientRegistration(argThat { region == ssoRegion })
        verify(ssoOidcClient).createToken(any<CreateTokenRequest>())
        verify(ssoCache).saveAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl }, eq(refreshedToken))
    }

    @Test
    fun `refresh access token error handling does not fail if AWS error details are missing`() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)
        setupCacheStub(expirationClientRegistration)

        val accessToken = DeviceAuthorizationGrantToken(ssoUrl, ssoRegion, "dummyToken", "refreshToken", clock.instant())
        ssoCache.stub {
            on(
                ssoCache.loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
            ).thenReturn(
                accessToken
            )
        }

        ssoOidcClient.stub {
            on(
                ssoOidcClient.createToken(refreshTokenRequest())
            )
                .thenThrow(AwsServiceException.builder().build())
        }

        assertThatThrownBy { runBlocking { sut.refreshToken(sut.accessToken()) } }
            .isInstanceOf(AwsServiceException::class.java)
    }

    @Test
    fun `PKCE refresh access token saves PKCE token`() {
        setPkceTrue()

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
    fun `exception stops device code polling`() {
        val expirationClientRegistration = clock.instant().plusSeconds(120)

        setupCacheStub(expirationClientRegistration)

        ssoOidcClient.stub {
            stubStartDeviceAuthorization()
            stubCreateToken(throws = true)
        }

        assertThatThrownBy { runBlocking { sut.accessToken() } }.isInstanceOf(InvalidRequestException::class.java)

        verify(ssoOidcClient).startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
        verify(ssoOidcClient).createToken(any<CreateTokenRequest>())
        verify(ssoCache).loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
        verify(ssoCache).loadClientRegistration(argThat<DeviceAuthorizationClientRegistrationCacheKey> { region == ssoRegion })
    }

    @Test
    fun `backoff time is respected during device code polling`() {
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

        verify(ssoCache).saveAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl }, eq(accessToken))

        verify(ssoOidcClient).startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
        verify(ssoOidcClient, times(2)).createToken(any<CreateTokenRequest>())
        verify(ssoCache).loadAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl })
        verify(ssoCache).loadClientRegistration(argThat<DeviceAuthorizationClientRegistrationCacheKey> { region == ssoRegion })
        verify(ssoCache).saveAccessToken(argThat<DeviceGrantAccessTokenCacheKey> { startUrl == ssoUrl }, eq(accessToken))
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
        verify(ssoCache).loadAccessToken(any())
        verify(ssoCache).loadClientRegistration(argThat { region == ssoRegion })
    }

    @Test
    fun `invalid device code registration clears the cache`() {
        setupCacheStub(Instant.now(clock))

        ssoOidcClient.stub {
            on(
                ssoOidcClient.startDeviceAuthorization(any<StartDeviceAuthorizationRequest>())
            ).thenThrow(
                InvalidClientException.builder().build()
            )
        }

        assertThatThrownBy { runBlocking { sut.accessToken() } }.isInstanceOf(InvalidClientException::class.java)

        verify(ssoCache, times(2)).invalidateClientRegistration(argThat<ClientRegistrationCacheKey> { region == ssoRegion })
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
                ssoCache.loadAccessToken(any())
            ).thenReturn(
                null
            )

            on(
                ssoCache.loadClientRegistration(argThat { region == ssoRegion })
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

    private fun setPkceTrue() = Registry.get("aws.dev.useDAG").setValue(false)
}
