// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev

import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.modules
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import org.junit.Before
import org.junit.Rule
import org.mockito.Mockito
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.awscore.util.AwsHeader
import software.amazon.awssdk.services.codewhispererruntime.model.CodeGenerationStatus
import software.amazon.awssdk.services.codewhispererruntime.model.CodeGenerationWorkflowStatus
import software.amazon.awssdk.services.codewhispererruntime.model.CreateTaskAssistConversationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTaskAssistCodeGenerationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTaskAssistCodeGenerationResponse
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.sso.DeviceAuthorizationGrantToken
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.GenerateTaskAssistPlanResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.CodeGenerationStreamResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.CodeReferenceGenerated
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import java.io.File
import java.time.Instant

open class FeatureDevTestBase(
    @Rule @JvmField
    val projectRule: CodeInsightTestFixtureRule = JavaCodeInsightTestFixtureRule(),
) {
    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    internal lateinit var project: Project
    internal lateinit var module: Module
    internal lateinit var clientAdaptorSpy: FeatureDevClient
    internal lateinit var toolkitConnectionManager: ToolkitConnectionManager

    internal val testRequestId = "test_aws_request_id"
    internal val testConversationId = "1234"
    internal val userMessage = "test-user-message"
    internal val testUploadId = "5678"
    internal val testRepositorySize = 20.0 // Picked a random size
    internal val testCodeGenerationId = "1234"
    internal val otherStatus = "Other"
    internal val testTabId = "test-tab-id"
    internal val testFilePaths = mapOf(Pair("test.ts", "This is a comment"))
    internal val testDeletedFiles = listOf("deleted.ts")
    internal val testReferences = listOf(CodeReferenceGenerated())
    internal val testChecksumSha = "test-sha"
    internal val testContentLength: Long = 40

    internal val exampleCreateTaskAssistConversationResponse = CreateTaskAssistConversationResponse.builder()
        .conversationId(testConversationId)
        .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(AwsHeader.AWS_REQUEST_ID to testRequestId)))
        .build() as CreateTaskAssistConversationResponse

    internal val exampleCreateUploadUrlResponse = CreateUploadUrlResponse.builder()
        .uploadUrl("https://smth.com")
        .uploadId(testUploadId)
        .kmsKeyArn("0000000000000000000000000000000000:key/1234abcd")
        .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(AwsHeader.AWS_REQUEST_ID to testRequestId)))
        .build() as CreateUploadUrlResponse

    internal val exampleGenerateTaskAssistPlanResult = GenerateTaskAssistPlanResult(approach = "Generated approach for plan", succeededPlanning = true)

    internal val exampleStartTaskAssistConversationResponse = StartTaskAssistCodeGenerationResponse.builder()
        .conversationId(testConversationId)
        .codeGenerationId(testCodeGenerationId)
        .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(AwsHeader.AWS_REQUEST_ID to testRequestId)))
        .build() as StartTaskAssistCodeGenerationResponse

    internal val exampleGetTaskAssistConversationResponse = GetTaskAssistCodeGenerationResponse.builder()
        .conversationId(testConversationId)
        .codeGenerationStatus(CodeGenerationStatus.builder().status(CodeGenerationWorkflowStatus.IN_PROGRESS).currentStage("InProgress").build())
        .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(AwsHeader.AWS_REQUEST_ID to testRequestId)))
        .build() as GetTaskAssistCodeGenerationResponse

    internal val exampleCompleteGetTaskAssistCodeGenerationResponse = GetTaskAssistCodeGenerationResponse.builder()
        .conversationId(testConversationId)
        .codeGenerationStatus(CodeGenerationStatus.builder().status(CodeGenerationWorkflowStatus.COMPLETE).currentStage("Complete").build())
        .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(AwsHeader.AWS_REQUEST_ID to testRequestId)))
        .build() as GetTaskAssistCodeGenerationResponse

    internal val exampleFailedGetTaskAssistCodeGenerationResponse = GetTaskAssistCodeGenerationResponse.builder()
        .conversationId(testConversationId)
        .codeGenerationStatus(CodeGenerationStatus.builder().status(CodeGenerationWorkflowStatus.FAILED).currentStage("Failed").build())
        .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(AwsHeader.AWS_REQUEST_ID to testRequestId)))
        .build() as GetTaskAssistCodeGenerationResponse

    internal val exampleOtherGetTaskAssistCodeGenerationResponse = GetTaskAssistCodeGenerationResponse.builder()
        .conversationId(testConversationId)
        .codeGenerationStatus(CodeGenerationStatus.builder().status(CodeGenerationWorkflowStatus.UNKNOWN_TO_SDK_VERSION).currentStage(otherStatus).build())
        .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(AwsHeader.AWS_REQUEST_ID to testRequestId)))
        .build() as GetTaskAssistCodeGenerationResponse

    internal val exampleExportResultArchiveResponse = mutableListOf(byteArrayOf(100))

    internal val exampleExportTaskAssistResultArchiveResponse: CodeGenerationStreamResult = CodeGenerationStreamResult(emptyMap(), emptyList(), emptyList())

    @Before
    open fun setup() {
        project = projectRule.project
        toolkitConnectionManager = spy(ToolkitConnectionManager.getInstance(project))
        val accessToken = DeviceAuthorizationGrantToken(aString(), aString(), aString(), aString(), Instant.MAX, Instant.now())
        val provider = mock<BearerTokenProvider> {
            doReturn(accessToken).whenever(it).refresh()
        }
        val mockBearerProvider = mock<ToolkitBearerTokenProvider> {
            doReturn(provider).whenever(it).delegate
        }
        val connectionSettingsMock = mock<TokenConnectionSettings> {
            whenever(it.tokenProvider).thenReturn(mockBearerProvider)
        }
        val toolkitConnection = mock<AwsBearerTokenConnection> {
            doReturn(connectionSettingsMock).whenever(it).getConnectionSettings()
        }
        doReturn(toolkitConnection).whenever(toolkitConnectionManager).activeConnectionForFeature(any())
        project.replaceService(ToolkitConnectionManager::class.java, toolkitConnectionManager, disposableRule.disposable)
        clientAdaptorSpy = spy(FeatureDevClient.getInstance(project))
        project.replaceService(FeatureDevClient::class.java, clientAdaptorSpy, disposableRule.disposable)

        module = project.modules.firstOrNull() ?: if (projectRule is HeavyJavaCodeInsightTestFixtureRule) {
            projectRule.fixture.addModule("module1")
        } else {
            TODO()
        }

        val virtualFileMock = Mockito.mock(VirtualFile::class.java)
        doReturn("dummy/path").whenever(virtualFileMock).path
    }

    companion object {
        fun String.toResourceFile(): File {
            val uri =
                FeatureDevTestBase::class.java.getResource("/amazonqFeatureDev/$this")?.toURI()
                    ?: throw AssertionError("Unable to locate test resource $this file.")
            return File(uri)
        }
    }
}
