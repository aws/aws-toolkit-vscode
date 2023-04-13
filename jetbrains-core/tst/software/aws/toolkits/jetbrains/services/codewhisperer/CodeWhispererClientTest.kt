// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.github.tomakehurst.wiremock.client.WireMock
import com.github.tomakehurst.wiremock.client.WireMock.matching
import com.github.tomakehurst.wiremock.client.WireMock.post
import com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor
import com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo
import com.github.tomakehurst.wiremock.client.WireMock.verify
import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import com.github.tomakehurst.wiremock.junit.WireMockRule
import com.intellij.openapi.application.ApplicationManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import software.amazon.awssdk.http.SdkHttpClient
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.codewhisperer.CodeWhispererClient
import software.aws.toolkits.core.utils.tryOrNull
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.MockClientManager
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererEndpointCustomizer

/**
 * If this test class failed, highly likely because the endpoint is overwritten by [CodeWhispererEndpointCustomizer]
 */
class CodeWhispererClientTest {
    val applicationRule = ApplicationRule()
    val mockCredentialManager = MockCredentialManagerRule()
    val mockClientManagerRule = MockClientManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(applicationRule, mockClientManagerRule, mockCredentialManager)

    @Rule
    @JvmField
    val wireMock = WireMockRule(WireMockConfiguration.wireMockConfig().dynamicPort())

    @Rule
    @JvmField
    val disposable = DisposableRule()

    private lateinit var httpClient: SdkHttpClient
    private lateinit var mockExplorerActionManager: CodeWhispererExplorerActionManager
    private lateinit var mockClient: CodeWhispererClient

    @Before
    fun setUp() {
        MockClientManager.useRealImplementations(disposable.disposable)

        // Endpoint will be override by CodeWhispererEndpointCustomizer if there is one, i.e. will call real one instead of localhost
        mockClient = AwsClientManager.getInstance().createUnmanagedClient(
            mockCredentialManager.createCredentialProvider(),
            Region.US_WEST_2,
            "http://127.0.0.1:${wireMock.port()}"
        )
        wireMock.stubFor(
            post("/")
                .willReturn(
                    WireMock.aResponse().withStatus(200)
                )
        )

        mockExplorerActionManager = mock()
        whenever(mockExplorerActionManager.resolveAccessToken()).thenReturn(CodeWhispererTestUtil.testValidAccessToken)
        ApplicationManager.getApplication().replaceService(CodeWhispererExplorerActionManager::class.java, mockExplorerActionManager, disposable.disposable)
    }

    @After
    fun tearDown() {
        tryOrNull { httpClient.close() }
    }

    @Test
    fun `check GetAccessToken request header`() {
        mockClient.getAccessToken {}
        verify(
            postRequestedFor(urlEqualTo("/"))
                .withoutHeader(CodeWhispererEndpointCustomizer.OPTOUT_KEY_NAME)
                .withoutHeader(CodeWhispererEndpointCustomizer.OPTOUT_KEY_NAME)
        )
    }

    @Test
    fun `check ListRecommendation request header`() {
        mockClient.listRecommendations {}
        // default is opt-in (thus opt-out = false)
        verify(
            postRequestedFor(urlEqualTo("/"))
                .withHeader(CodeWhispererEndpointCustomizer.TOKEN_KEY_NAME, matching(CodeWhispererTestUtil.testValidAccessToken))
                .withHeader(CodeWhispererEndpointCustomizer.OPTOUT_KEY_NAME, matching("false"))
        )

        CodeWhispererSettings.getInstance().toggleMetricOptIn(false)
        mockClient.listRecommendations {}
        verify(
            postRequestedFor(urlEqualTo("/"))
                .withHeader(CodeWhispererEndpointCustomizer.TOKEN_KEY_NAME, matching(CodeWhispererTestUtil.testValidAccessToken))
                .withHeader(CodeWhispererEndpointCustomizer.OPTOUT_KEY_NAME, matching("true"))
        )
    }

    @Test
    fun `check createCodeScan request header`() {
        mockClient.createCodeScan {}
        verify(
            postRequestedFor(urlEqualTo("/"))
                .withHeader(CodeWhispererEndpointCustomizer.TOKEN_KEY_NAME, matching(CodeWhispererTestUtil.testValidAccessToken))
                .withoutHeader(CodeWhispererEndpointCustomizer.OPTOUT_KEY_NAME)

        )
    }

    @Test
    fun `check createUploadUrl request header`() {
        mockClient.createCodeScanUploadUrl {}
        verify(
            postRequestedFor(urlEqualTo("/"))
                .withHeader(CodeWhispererEndpointCustomizer.TOKEN_KEY_NAME, matching(CodeWhispererTestUtil.testValidAccessToken))
                .withoutHeader(CodeWhispererEndpointCustomizer.OPTOUT_KEY_NAME)
        )
    }

    @Test
    fun `check listCodeScanFindings request header`() {
        mockClient.listCodeScanFindings {}
        verify(
            postRequestedFor(urlEqualTo("/"))
                .withHeader(CodeWhispererEndpointCustomizer.TOKEN_KEY_NAME, matching(CodeWhispererTestUtil.testValidAccessToken))
                .withoutHeader(CodeWhispererEndpointCustomizer.OPTOUT_KEY_NAME)
        )
    }
}
