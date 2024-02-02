// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.amazonqFeatureDev.clients

import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.launch
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.ArgumentCaptor
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
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClient
import software.amazon.awssdk.services.codewhispererstreaming.model.GenerateTaskAssistPlanRequest
import software.amazon.awssdk.services.codewhispererstreaming.model.GenerateTaskAssistPlanResponseHandler
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.BearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedSsoProfile
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockToolkitAuthManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.codewhisperer.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.util.concurrent.CompletableFuture

class FeatureDevClientTest : FeatureDevTestBase() {
    val mockClientManagerRule = MockClientManagerRule()
    val mockCredentialRule = MockCredentialManagerRule()
    val authManagerRule = MockToolkitAuthManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, mockCredentialRule, mockClientManagerRule, disposableRule)

    private lateinit var bearerClient: CodeWhispererRuntimeClient
    private lateinit var streamingBearerClient: CodeWhispererStreamingAsyncClient
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
        }

        streamingBearerClient = mockClientManagerRule.create<CodeWhispererStreamingAsyncClient>().stub {
            on { generateTaskAssistPlan(any<GenerateTaskAssistPlanRequest>(), any<GenerateTaskAssistPlanResponseHandler>()) } doReturn CompletableFuture()
        }

        val mockConnection = mock<BearerSsoConnection>()
        whenever(mockConnection.getConnectionSettings()) doReturn mock<TokenConnectionSettings>()

        connectionManager = mock {
            on {
                activeConnectionForFeature(any())
            } doReturn authManagerRule.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList())) as AwsBearerTokenConnection
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

        val actual = featureDevClient.createTaskAssistUploadUrl("test-id", "test-sha", testContentLength)

        argumentCaptor<CreateUploadUrlRequest>().apply {
            verify(bearerClient).createUploadUrl(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(CreateUploadUrlResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("uploadUrl", "uploadId", "kmsKeyArn")
                .isEqualTo(exampleCreateUploadUrlResponse)
        }
    }

    @Test
    fun `check generateTaskAssistPlan`() {
        val requestCaptor = ArgumentCaptor.forClass(GenerateTaskAssistPlanRequest::class.java)
        val handlerCaptor = ArgumentCaptor.forClass(GenerateTaskAssistPlanResponseHandler::class.java)

        projectCoroutineScope(project).launch {
            featureDevClient.generateTaskAssistPlan("test-id", "test-upload-id", "test-user-message")
            argumentCaptor<GenerateTaskAssistPlanRequest, GenerateTaskAssistPlanResponseHandler>().apply {
                verify(streamingBearerClient).generateTaskAssistPlan(requestCaptor.capture(), handlerCaptor.capture())
                verifyNoInteractions(bearerClient)
            }
        }
    }
}
