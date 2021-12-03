// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation

import com.github.tomakehurst.wiremock.client.WireMock.aResponse
import com.github.tomakehurst.wiremock.client.WireMock.requestMatching
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import com.github.tomakehurst.wiremock.junit.WireMockRule
import com.github.tomakehurst.wiremock.matching.MatchResult
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.RuleChain
import org.apache.http.HttpHost
import org.apache.http.conn.routing.HttpRoute
import org.apache.http.conn.routing.HttpRoutePlanner
import org.apache.http.impl.client.CloseableHttpClient
import org.apache.http.impl.client.HttpClientBuilder
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.AwsSessionCredentials
import software.amazon.awssdk.services.sts.StsClient
import software.amazon.awssdk.services.sts.model.GetFederationTokenRequest
import software.amazon.awssdk.services.sts.model.GetFederationTokenResponse
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.region.US_EAST_1
import java.net.InetAddress

class AwsConsoleUrlFactoryTest {
    val applicationRule = ApplicationRule()
    val mockClientManager = MockClientManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(applicationRule, mockClientManager)

    @Rule
    @JvmField
    val wireMock = WireMockRule(WireMockConfiguration.wireMockConfig().dynamicPort())

    private lateinit var stsMock: StsClient
    private lateinit var httpClient: CloseableHttpClient
    private lateinit var sut: AwsConsoleUrlFactory

    @Before
    fun setUp() {
        val httpBuilderMock = mock<HttpClientBuilder>()
        httpClient = HttpClientBuilder.create()
            .setRoutePlanner(HttpRoutePlanner { _, _, _ -> HttpRoute(HttpHost(InetAddress.getLoopbackAddress(), wireMock.port(), "http")) })
            .build()
        whenever(httpBuilderMock.setUserAgent(any())).thenReturn(httpBuilderMock)
        whenever(httpBuilderMock.build()).thenReturn(httpClient)

        stsMock = mockClientManager.create()

        wireMock.stubFor(
            requestMatching { request ->
                val action = "getSigninToken"
                val matches = tryOrNull { request.queryParameter("Action").values().any { it == action } }
                    ?: request.bodyAsString.contains("Action=$action")

                MatchResult.of(matches)
            }.willReturn(
                aResponse().withStatus(200).withBody("""{"SigninToken": "signinToken"}""")
            )
        )

        sut = AwsConsoleUrlFactory(httpBuilderMock)
    }

    @After
    fun tearDown() {
        tryOrNull { httpClient.close() }
    }

    @Test
    fun `getSigninToken uses temporary credentials as-is`() {
        val tempCreds = AwsSessionCredentials.create("accessKey", "secretKey", "sessionToken")

        verifyNoMoreInteractions(stsMock)
        assertThat(sut.getSigninToken(tempCreds, US_EAST_1)).isEqualTo("signinToken")
    }

    @Test
    fun `getSigninToken requests federation token for long-term credentials`() {
        val longCreds = AwsBasicCredentials.create("basicKeyId", "basicSecretKey")
        whenever(stsMock.getFederationToken(any<GetFederationTokenRequest>())).thenReturn(
            GetFederationTokenResponse.builder()
                .credentials {
                    it.accessKeyId("federatedAccessKey")
                    it.secretAccessKey("federatedSecretAccessKey")
                    it.sessionToken("federatedSessionToken")
                }
                .build()
        )

        assertThat(sut.getSigninToken(longCreds, US_EAST_1)).isEqualTo("signinToken")
    }

    @Test
    fun `build sign-in url`() {
        val tempCreds = AwsSessionCredentials.create("accessKey", "secretKey", "sessionToken")

        assertThat(sut.getSigninUrl(tempCreds, destination = "/something", region = US_EAST_1))
            .isEqualTo(
                """
                https://signin.aws.amazon.com/federation?Action=login&SigninToken=signinToken&Destination=https%3A%2F%2Fus-east-1.console.aws.amazon.com%2Fsomething
                """.trimIndent()
            )
    }
}
