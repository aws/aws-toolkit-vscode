// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codemodernizer

import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoInteractions
import org.mockito.kotlin.verifyNoMoreInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationPlanRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationPlanResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StopTransformationRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StopTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationLanguage
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
import software.aws.toolkits.jetbrains.services.amazonq.clients.AmazonQStreamingClient
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.settings.AwsSettings
import java.util.concurrent.CompletableFuture

class CodeWhispererCodeModernizerGumbyClientTest : CodeWhispererCodeModernizerTestBase() {
    val mockClientManagerRule = MockClientManagerRule()
    val mockCredentialRule = MockCredentialManagerRule()
    val authManagerRule = MockToolkitAuthManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, mockCredentialRule, mockClientManagerRule, disposableRule)

    private lateinit var bearerClient: CodeWhispererRuntimeClient
    private lateinit var streamingBearerClient: CodeWhispererStreamingAsyncClient
    private lateinit var amazonQStreamingClient: AmazonQStreamingClient
    private lateinit var ssoClient: SsoOidcClient

    private lateinit var gumbyClient: GumbyClient
    private lateinit var connectionManager: ToolkitConnectionManager
    private var isTelemetryEnabledDefault: Boolean = false

    @Before
    override fun setup() {
        super.setup()
        gumbyClient = GumbyClient.getInstance(projectRule.project)
        ssoClient = mockClientManagerRule.create()

        bearerClient = mockClientManagerRule.create<CodeWhispererRuntimeClient>().stub {
            on { createUploadUrl(any<CreateUploadUrlRequest>()) } doReturn exampleCreateUploadUrlResponse
            on { getTransformation(any<GetTransformationRequest>()) } doReturn exampleGetCodeMigrationResponse
            on { startTransformation(any<StartTransformationRequest>()) } doReturn exampleStartCodeMigrationResponse
            on { getTransformationPlan(any<GetTransformationPlanRequest>()) } doReturn exampleGetCodeMigrationPlanResponse
            on { stopTransformation(any<StopTransformationRequest>()) } doReturn exampleStopTransformationResponse
        }

        streamingBearerClient = mockClientManagerRule.create<CodeWhispererStreamingAsyncClient>().stub {
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
    fun `check createUploadUrl`() {
        val actual = gumbyClient.createGumbyUploadUrl("test")
        argumentCaptor<CreateUploadUrlRequest>().apply {
            verify(bearerClient).createUploadUrl(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(CreateUploadUrlResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("uploadUrl", "uploadId", "kmsKeyArn")
                .isEqualTo(exampleCreateUploadUrlResponse)
        }
    }

    @Test
    fun `check getCodeModernizationJob`() {
        val actual = gumbyClient.getCodeModernizationJob("jobId")
        argumentCaptor<GetTransformationRequest>().apply {
            verify(bearerClient).getTransformation(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(GetTransformationResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("jobId", "status", "transformationType", "source")
                .isEqualTo(exampleGetCodeMigrationResponse)
        }
    }

    @Test
    fun `check startCodeModernization`() {
        val actual = gumbyClient.startCodeModernization("jobId", TransformationLanguage.JAVA_8, TransformationLanguage.JAVA_17)
        argumentCaptor<StartTransformationRequest>().apply {
            verify(bearerClient).startTransformation(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(StartTransformationResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("transformationJobId").isEqualTo(exampleStartCodeMigrationResponse)
        }
    }

    @Test
    fun `check getCodeModernizationPlan`() {
        val actual = gumbyClient.getCodeModernizationPlan(JobId("JobId"))
        argumentCaptor<GetTransformationPlanRequest>().apply {
            verify(bearerClient).getTransformationPlan(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(GetTransformationPlanResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("transformationSteps").isEqualTo(exampleGetCodeMigrationPlanResponse)
        }
    }

    @Test
    fun `check stopTransformation`() {
        val actual = gumbyClient.stopTransformation("JobId")
        argumentCaptor<StopTransformationRequest>().apply {
            verify(bearerClient).stopTransformation(capture())
            verifyNoInteractions(streamingBearerClient)
            assertThat(actual).isInstanceOf(StopTransformationResponse::class.java)
            assertThat(actual).usingRecursiveComparison().comparingOnlyFields("transformationStatus").isEqualTo(exampleStopTransformationResponse)
        }
    }

    @Test
    fun `check downloadExportResultArchive`() = runTest {
        whenever(amazonQStreamingClient.exportResultArchive(any<String>(), any<ExportIntent>(), any(), any())) doReturn exampleExportResultArchiveResponse

        val actual = gumbyClient.downloadExportResultArchive(jobId)

        verify(amazonQStreamingClient).exportResultArchive(eq(jobId.id), eq(ExportIntent.TRANSFORMATION), any(), any())
        verifyNoInteractions(bearerClient)
        verifyNoInteractions(streamingBearerClient)
        verifyNoMoreInteractions(amazonQStreamingClient)
        assertThat(actual).usingRecursiveComparison().isEqualTo(exampleExportResultArchiveResponse)
    }
}
