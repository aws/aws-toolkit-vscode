// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.clients

import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.test.runTest
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClient
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportIntent
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportResultArchiveRequest
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportResultArchiveResponseHandler
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedSsoProfile
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockToolkitAuthManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.services.amazonq.AmazonQTestBase
import java.util.concurrent.CompletableFuture

class AmazonQStreamingClientTest : AmazonQTestBase() {
    val mockClientManagerRule = MockClientManagerRule()
    private val mockCredentialRule = MockCredentialManagerRule()
    private val authManagerRule = MockToolkitAuthManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, mockCredentialRule, mockClientManagerRule, disposableRule)

    private lateinit var streamingBearerClient: CodeWhispererStreamingAsyncClient
    private lateinit var ssoClient: SsoOidcClient

    private lateinit var amazonQStreamingClient: AmazonQStreamingClient
    private lateinit var connectionManager: ToolkitConnectionManager

    @Before
    override fun setup() {
        super.setup()
        amazonQStreamingClient = AmazonQStreamingClient.getInstance(projectRule.project)
        ssoClient = mockClientManagerRule.create()

        streamingBearerClient = mockClientManagerRule.create<CodeWhispererStreamingAsyncClient>().stub {
            on {
                exportResultArchive(any<ExportResultArchiveRequest>(), any<ExportResultArchiveResponseHandler>())
            } doReturn CompletableFuture.completedFuture(mock()) // void type can't be instantiated
        }

        val mockConnection = mock<AwsBearerTokenConnection>()
        whenever(mockConnection.getConnectionSettings()) doReturn mock<TokenConnectionSettings>()

        connectionManager = mock {
            on {
                activeConnectionForFeature(any())
            } doReturn authManagerRule.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList())) as AwsBearerTokenConnection
        }

        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
    }

    @Test
    fun `check exportResultArchive`() = runTest {
        val requestCaptor = argumentCaptor<ExportResultArchiveRequest>()
        val handlerCaptor = argumentCaptor<ExportResultArchiveResponseHandler>()

        amazonQStreamingClient.exportResultArchive("test-id", ExportIntent.TRANSFORMATION, null, {}, {})
        argumentCaptor<ExportResultArchiveRequest, ExportResultArchiveResponseHandler>().apply {
            verify(streamingBearerClient).exportResultArchive(requestCaptor.capture(), handlerCaptor.capture())
        }
    }
}
