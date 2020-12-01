// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.core.credentials.sso

import com.nhaarman.mockitokotlin2.KStubbing
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.eq
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Test
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

    private lateinit var ssoLoginCallback: SsoLoginCallback
    private lateinit var ssoOidcClient: SsoOidcClient
    private lateinit var sut: SsoAccessTokenProvider
    private lateinit var ssoCache: SsoCache

    @Before
    fun setUp() {
        ssoOidcClient = delegateMock()
        ssoLoginCallback = mock()
        ssoCache = mock()

        sut = SsoAccessTokenProvider(ssoUrl, ssoRegion, ssoLoginCallback, ssoCache, ssoOidcClient, clock)
    }

    @Test
    fun getAccessTokenWithAccessTokenCache() {
        val accessToken = AccessToken(ssoUrl, ssoRegion, "dummyToken", clock.instant())
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
                AccessToken(
                    ssoUrl,
                    ssoRegion,
                    "accessToken",
                    clock.instant().plusSeconds(180)
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
                        .clientName("aws-toolkit-jetbrains-${Instant.now(clock)}")
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
                AccessToken(
                    ssoUrl,
                    ssoRegion,
                    "accessToken",
                    clock.instant().plusSeconds(180)
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

        assertThat(accessToken).usingRecursiveComparison()
            .isEqualTo(
                AccessToken(
                    ssoUrl,
                    ssoRegion,
                    "accessToken",
                    clock.instant().plusSeconds(180)
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
                AccessToken(
                    ssoUrl,
                    ssoRegion,
                    "accessToken",
                    clock.instant().plusSeconds(180)
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
        setupCacheStub(ClientRegistration(clientId, clientSecret, expirationClientRegistration))
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
}
