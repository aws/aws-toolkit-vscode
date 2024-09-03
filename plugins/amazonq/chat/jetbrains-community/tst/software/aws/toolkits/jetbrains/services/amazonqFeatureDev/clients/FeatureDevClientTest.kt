// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients

import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.CreateTaskAssistConversationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateTaskAssistConversationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTaskAssistCodeGenerationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetTaskAssistCodeGenerationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTaskAssistCodeGenerationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartTaskAssistCodeGenerationResponse
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClient
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportResultArchiveRequest
import software.amazon.awssdk.services.codewhispererstreaming.model.ExportResultArchiveResponseHandler
import software.amazon.awssdk.services.codewhispererstreaming.model.GenerateTaskAssistPlanRequest
import software.amazon.awssdk.services.codewhispererstreaming.model.GenerateTaskAssistPlanResponseHandler
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedSsoProfile
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockToolkitAuthManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.services.amazonq.clients.AmazonQStreamingClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.util.concurrent.CompletableFuture

class FeatureDevClientTest : FeatureDevTestBase() {
    val mockClientManagerRule = MockClientManagerRule()
    private val mockCredentialRule = MockCredentialManagerRule()
    private val authManagerRule = MockToolkitAuthManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, mockCredentialRule, mockClientManagerRule, disposableRule)

    private lateinit var bearerClient: CodeWhispererRuntimeClient
    private lateinit var streamingBearerClient: CodeWhispererStreamingAsyncClient
    private lateinit var amazonQStreamingClient: AmazonQStreamingClient
    private lateinit var ssoClient: SsoOidcClient

    private lateinit var featureDevClient: FeatureDevClient
    private lateinit var connectionManager: ToolkitConnectionManager
    private var isTelemetryEnabledDefault: Boolean = false

    @Before
    override fun setup() {
        super.setup()
        featureDevClient = FeatureDevClient.getInstance(projectRule.project)
        ssoClient = mockClientManagerRule.create()

        bearerClient = mockClientManagerRule.create<CodeWhispererRuntimeClient>().stub {
            on { createTaskAssistConversation(any<CreateTaskAssistConversationRequest>()) } doReturn exampleCreateTaskAssistConversationResponse
            on { createUploadUrl(any<CreateUploadUrlRequest>()) } doReturn exampleCreateUploadUrlResponse
            on { startTaskAssistCodeGeneration(any<StartTaskAssistCodeGenerationRequest>()) } doReturn exampleStartTaskAssistConversationResponse
            on { getTaskAssistCodeGeneration(any<GetTaskAssistCodeGenerationRequest>()) } doReturn exampleGetTaskAssistConversationResponse
        }

        streamingBearerClient = mockClientManagerRule.create<CodeWhispererStreamingAsyncClient>().stub {
            on {
                generateTaskAssistPlan(any<GenerateTaskAssistPlanRequest>(), any<GenerateTaskAssistPlanResponseHandler>())
            } doReturn CompletableFuture.completedFuture(mock()) // void type can't be instantiated

            on {
                exportResultArchive(any<ExportResultArchiveRequest>(), any<ExportResultArchiveResponseHandler>())
            } doReturn CompletableFuture.completedFuture(mock()) // void type can't be instantiated
        }

        amazonQStreamingClient = mock<AmazonQStreamingClient>()
        projectRule.project.replaceService(AmazonQStreamingClient::class.java, amazonQStreamingClient, disposableRule.disposable)

        val mockConnection = mock<AwsBearerTokenConnection>()
        whenever(mockConnection.getConnectionSettings()) doReturn mock<TokenConnectionSettings>()

        connectionManager = mock {
            on {
                activeConnectionForFeature(any())
            } doReturn authManagerRule.createConnection(ManagedSsoProfile("us-east-1", aString(), listOf("scopes"))) as AwsBearerTokenConnection
        }
        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)

        isTelemetryEnabledDefault = AwsSettings.getInstance().isTelemetryEnabled
    }

    @After
    fun tearDown() {
        AwsSettings.getInstance().isTelemetryEnabled = isTelemetryEnabledDefault
    }

    @Test
    fun `check createTaskAssistConversation`() {
        val actual = featureDevClient.createTaskAssistConversation()
        argumentCaptor<CreateTaskAssistConversationRequest>().apply {
            verify(bearerClient).createTaskAssistConversation(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(CreateTaskAssistConversationResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("conversationID")
                .isEqualTo(exampleCreateTaskAssistConversationResponse)
        }
    }

    @Test
    fun `check createTaskAssistUploadUrl`() {
        val testContentLength: Long = 42

        val actual = featureDevClient.createTaskAssistUploadUrl(testConversationId, "test-sha", testContentLength)

        argumentCaptor<CreateUploadUrlRequest>().apply {
            verify(bearerClient).createUploadUrl(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(CreateUploadUrlResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("uploadUrl", "uploadId", "kmsKeyArn")
                .isEqualTo(exampleCreateUploadUrlResponse)
        }
    }

    @Test
    fun `check startTaskAssistCodeGeneration`() {
        val actual = featureDevClient.startTaskAssistCodeGeneration(testConversationId, "test-upload-id", "test-user-message")

        argumentCaptor<StartTaskAssistCodeGenerationRequest>().apply {
            verify(bearerClient).startTaskAssistCodeGeneration(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(StartTaskAssistCodeGenerationResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("conversationId", "codeGenerationId")
                .isEqualTo(exampleStartTaskAssistConversationResponse)
        }
    }

    @Test
    fun `check getTaskAssistCodeGeneration`() {
        val actual = featureDevClient.getTaskAssistCodeGeneration(testConversationId, "test-code-generation-id")

        argumentCaptor<GetTaskAssistCodeGenerationRequest>().apply {
            verify(bearerClient).getTaskAssistCodeGeneration(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(GetTaskAssistCodeGenerationResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("conversationId", "codeGenerationStatus")
                .isEqualTo(exampleGetTaskAssistConversationResponse)
        }
    }
}
