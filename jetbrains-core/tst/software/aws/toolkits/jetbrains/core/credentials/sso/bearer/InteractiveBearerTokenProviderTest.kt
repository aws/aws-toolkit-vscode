// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sso.bearer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.RuleChain
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito
import org.mockito.kotlin.any
import org.mockito.kotlin.argThat
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.auth.credentials.AnonymousCredentialsProvider
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration
import software.amazon.awssdk.core.exception.SdkException
import software.amazon.awssdk.core.interceptor.Context
import software.amazon.awssdk.core.interceptor.ExecutionAttributes
import software.amazon.awssdk.core.interceptor.ExecutionInterceptor
import software.amazon.awssdk.core.internal.InternalCoreExecutionAttribute
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.amazon.awssdk.services.ssooidc.model.AccessDeniedException
import software.amazon.awssdk.services.ssooidc.model.CreateTokenRequest
import software.amazon.awssdk.services.ssooidc.model.CreateTokenResponse
import software.amazon.awssdk.services.ssooidc.model.InvalidGrantException
import software.aws.toolkits.core.region.aRegionId
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.MockClientManager
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_URL
import software.aws.toolkits.jetbrains.core.credentials.sso.AccessToken
import software.aws.toolkits.jetbrains.core.credentials.sso.AccessTokenCacheKey
import software.aws.toolkits.jetbrains.core.credentials.sso.ClientRegistration
import software.aws.toolkits.jetbrains.core.credentials.sso.ClientRegistrationCacheKey
import software.aws.toolkits.jetbrains.core.credentials.sso.DiskCache
import java.time.Instant
import java.time.temporal.ChronoUnit

class InteractiveBearerTokenProviderTest {
    val applicationRule = ApplicationRule()
    val mockClientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(
        applicationRule,
        mockClientManager
    )

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var oidcClient: SsoOidcClient
    private val diskCache = mock<DiskCache>()
    private val startUrl = aString()
    private val region = aRegionId()
    private val scopes = listOf("scope1", "scope2")

    @Before
    fun setUp() {
        oidcClient = mockClientManager.create<SsoOidcClient>()
    }

    @After
    fun tearDown() {
        oidcClient.close()
    }

    @Test
    fun `oidcClient retries twice on InvalidGrantException failure`() {
        fun verifyRetryAttempts(configuration: ClientOverrideConfiguration.Builder) {
            configuration.addExecutionInterceptor(
                object : ExecutionInterceptor {
                    override fun onExecutionFailure(context: Context.FailedExecution?, executionAttributes: ExecutionAttributes?) {
                        super.onExecutionFailure(context, executionAttributes)

                        // 3 total network calls, showing 4 since the sdk increments the attempt count at the beginning
                        // of the loop before it checks whether it's allowed to retry.
                        assertThat(executionAttributes?.getAttribute(InternalCoreExecutionAttribute.EXECUTION_ATTEMPT)).isEqualTo(4)
                    }
                }
            )
        }
        fun buildUnmanagedSsoOidcClientForTests(region: String): SsoOidcClient =
            AwsClientManager.getInstance()
                .createUnmanagedClient(
                    AnonymousCredentialsProvider.create(),
                    Region.of(region),
                    clientCustomizer = { _, _, _, _, configuration ->
                        verifyRetryAttempts(ssoOidcClientConfigurationBuilder(configuration))
                    }
                )

        MockClientManager.useRealImplementations(disposableRule.disposable)
        oidcClient = spy(buildUnmanagedSsoOidcClientForTests("us-east-1"))
        val registerClientResponse = oidcClient.registerClient {
            it.clientType("public")
            it.scopes(scopes)
            it.clientName("test")
        }
        val deviceAuthorizationResponse = oidcClient.startDeviceAuthorization {
            it.clientId(registerClientResponse.clientId())
            it.clientSecret(registerClientResponse.clientSecret())
            it.startUrl(SONO_URL)
        }
        assertThrows<InvalidGrantException> {
            oidcClient.createToken {
                it.clientId(registerClientResponse.clientId())
                it.clientSecret(registerClientResponse.clientSecret())
                it.deviceCode(deviceAuthorizationResponse.deviceCode() + "invalid")
                it.grantType("urn:ietf:params:oauth:grant-type:device_code")
            }
        }
    }

    @Test
    fun `resolveToken does't refresh if token was retrieved recently`() {
        stubClientRegistration()
        whenever(diskCache.loadAccessToken(any<AccessTokenCacheKey>())).thenReturn(
            AccessToken(
                startUrl = startUrl,
                region = region,
                accessToken = "accessToken",
                refreshToken = "refreshToken",
                expiresAt = Instant.now().plus(1, ChronoUnit.HOURS)
            )
        )
        val sut = buildSut()
        sut.resolveToken()
    }

    @Test
    fun `resolveToken throws if reauthentication is needed`() {
        stubClientRegistration()
        stubAccessToken()
        Mockito.reset(oidcClient)
        whenever(oidcClient.createToken(any<CreateTokenRequest>())).thenThrow(AccessDeniedException.create("denied", null))

        val sut = buildSut()
        assertThrows<SdkException> { sut.resolveToken() }
    }

    @Test
    fun `invalidate notifies listeners of update`() {
        val mockListener = mock<BearerTokenProviderListener>()
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(BearerTokenProviderListener.TOPIC, mockListener)

        stubClientRegistration()
        stubAccessToken()
        val sut = buildSut()
        sut.invalidate()

        verify(mockListener).onChange(sut.id)
    }

    @Test
    fun `invalidate clears correctly`() {
        stubClientRegistration()
        stubAccessToken()
        val sut = buildSut()
        sut.invalidate()

        // initial load
        verify(diskCache).loadAccessToken(any<AccessTokenCacheKey>())

        // clears out on-disk token
        verify(diskCache).invalidateAccessToken(
            argThat<AccessTokenCacheKey> {
                val (_, url, scopes) = this
                url == startUrl && scopes == this.scopes
            }
        )

        // nothing else
        verifyNoMoreInteractions(diskCache)
    }

    @Test
    fun `reauthenticate updates current token`() {
        stubClientRegistration()
        stubAccessToken()
        val sut = buildSut()

        assertThat(sut.currentToken()?.accessToken).isEqualTo("accessToken")

        // and now instead of trying to stub out the entire OIDC device flow, abuse the fact that we short-circuit and read from disk if available
        Mockito.reset(diskCache)
        whenever(diskCache.loadAccessToken(any<AccessTokenCacheKey>())).thenReturn(
            AccessToken(
                startUrl = startUrl,
                region = region,
                accessToken = "access1",
                refreshToken = "refresh1",
                expiresAt = Instant.MAX
            )
        )
        sut.reauthenticate()

        assertThat(sut.currentToken()?.accessToken).isEqualTo("access1")
    }

    @Test
    fun `reauthenticate notifies listeners of update`() {
        val mockListener = mock<BearerTokenProviderListener>()
        val conn = ApplicationManager.getApplication().messageBus.connect()
        conn.subscribe(BearerTokenProviderListener.TOPIC, mockListener)

        stubClientRegistration()
        stubAccessToken()
        val sut = buildSut()
        sut.reauthenticate()

        // once for invalidate, once after the token has been retrieved
        verify(mockListener, times(2)).onChange(sut.id)
    }

    private fun buildSut() = InteractiveBearerTokenProvider(
        startUrl = startUrl,
        region = region,
        scopes = scopes,
        cache = diskCache,
        id = "test"
    )

    private fun stubClientRegistration() {
        whenever(diskCache.loadClientRegistration(any<ClientRegistrationCacheKey>())).thenReturn(
            ClientRegistration(
                "",
                "",
                Instant.MAX
            )
        )
    }

    private fun stubAccessToken() {
        whenever(diskCache.loadAccessToken(any<AccessTokenCacheKey>())).thenReturn(
            AccessToken(
                startUrl = startUrl,
                region = region,
                accessToken = "accessToken",
                refreshToken = "refreshToken",
                expiresAt = Instant.MIN
            )
        )
        whenever(oidcClient.createToken(any<CreateTokenRequest>())).thenReturn(
            CreateTokenResponse.builder()
                .refreshToken("refresh1")
                .accessToken("access1")
                .expiresIn(1800)
                .build()
        )
    }
}
