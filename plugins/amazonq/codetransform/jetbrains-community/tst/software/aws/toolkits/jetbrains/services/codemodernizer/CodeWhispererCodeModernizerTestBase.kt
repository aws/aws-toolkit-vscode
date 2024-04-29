// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.module.Module
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.modules
import com.intellij.openapi.projectRoots.JavaSdkVersion
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.RegisterToolWindowTask
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.Job
import org.gradle.internal.impldep.com.amazonaws.ResponseMetadata
import org.junit.Before
import org.junit.Rule
import org.mockito.Mockito
import org.mockito.kotlin.any
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.whenever
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationPlanResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StopTransformationResponse
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationJob
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationPlan
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationProjectState
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationSpec
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStatus
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationStep
import software.amazon.awssdk.services.codewhispererruntime.model.TransformationType
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.credentials.ToolkitBearerTokenProvider
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.sso.DeviceAuthorizationGrantToken
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider
import software.aws.toolkits.jetbrains.services.codemodernizer.client.GumbyClient
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerArtifact
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerManifest
import software.aws.toolkits.jetbrains.services.codemodernizer.model.CodeModernizerSessionContext
import software.aws.toolkits.jetbrains.services.codemodernizer.model.JobId
import software.aws.toolkits.jetbrains.services.codemodernizer.model.MigrationStep
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers.CodeModernizerBottomWindowPanelManager
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.codemodernizer.toolwindow.CodeModernizerBottomToolWindowFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.HeavyJavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.rules.addModule
import java.io.File
import java.time.Instant

open class CodeWhispererCodeModernizerTestBase(
    @Rule @JvmField
    val projectRule: CodeInsightTestFixtureRule = JavaCodeInsightTestFixtureRule(),
) {
    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    internal lateinit var project: Project
    internal lateinit var module: Module
    internal lateinit var clientAdaptorSpy: GumbyClient
    internal lateinit var codeModernizerManagerSpy: CodeModernizerManager
    internal lateinit var toolkitConnectionManager: ToolkitConnectionManager
    internal lateinit var telemetryManagerSpy: CodeTransformTelemetryManager
    lateinit var toolWindowMock: ToolWindow
    lateinit var testSessionContextSpy: CodeModernizerSessionContext
    lateinit var testModernizerBottomWindowPanelSpy: CodeModernizerBottomWindowPanelManager
    internal lateinit var testSessionSpy: CodeModernizerSession
    internal lateinit var testSessionStateSpy: CodeModernizerSessionState
    internal val diffResource = "diff.patch".toResourceFile()
    internal val examplePatchVirtualFile = LightVirtualFile("diff.patch", diffResource.readText())
    internal val emptyPomFile = LightVirtualFile("pom.xml", "")
    internal val jobId = JobId("Test job id")
    internal val migrationStep = MigrationStep("Test migration step")
    internal lateinit var testCodeModernizerArtifact: CodeModernizerArtifact
    internal val exampleZipPath = "simple.zip".toResourceFile().toPath()
    internal val expectedFilePath = "expectedFile".toResourceFile().toPath()
    internal val overwrittenFilePath = "overwrittenFile".toResourceFile().toPath()
    internal val testRequestId = "test_aws_request_id"
    internal val testSessionId = "test_codewhisperer_session_id"
    internal val validZipPatchDirPath = "patch/"
    internal val validZipArtifactsPath = "artifacts/"
    internal val validZipSummaryPath = "summary/"
    internal val validZipManifestPath = "manifest.json"
    internal val validZipPatchFilePath = "patch/diff.patch"
    internal val validZipManifestVersion = 1.0F
    internal val validManifest =
        CodeModernizerManifest(
            validZipManifestVersion,
            validZipPatchDirPath,
            validZipArtifactsPath,
            validZipSummaryPath,
        )
    internal val validTransformationSummary =
        TransformationSummary(
            """
            # This is a title
            With some text
            [and a link](https://www.amazon.com/)

            1. Some bullets
            2. Some more bullets

            `some code`

            """.trimIndent(),
        )

    internal val exampleCreateUploadUrlResponse =
        CreateUploadUrlResponse.builder()
            .uploadUrl("https://smth.com")
            .uploadId("1234")
            .kmsKeyArn("0000000000000000000000000000000000:key/1234abcd")
            .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(ResponseMetadata.AWS_REQUEST_ID to testRequestId)))
            .sdkHttpResponse(SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))).build())
            .build() as CreateUploadUrlResponse

    internal val exampleStartCodeMigrationResponse =
        StartTransformationResponse.builder()
            .transformationJobId(jobId.id)
            .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(ResponseMetadata.AWS_REQUEST_ID to testRequestId)))
            .sdkHttpResponse(SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))).build())
            .build() as StartTransformationResponse

    internal val exampleGetCodeMigrationPlanResponse =
        GetTransformationPlanResponse
            .builder()
            .transformationPlan(
                TransformationPlan.builder()
                    .transformationSteps(
                        listOf(
                            TransformationStep.builder()
                                .description("first step description")
                                .name("first step name")
                                .id("Id#1")
                                .build(),
                            TransformationStep.builder()
                                .description("This is the second step we are doing")
                                .name("second step name")
                                .id("Id#2")
                                .build(),
                        ),
                    ).build(),
            )
            .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(ResponseMetadata.AWS_REQUEST_ID to testRequestId)))
            .sdkHttpResponse(SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))).build())
            .build() as GetTransformationPlanResponse

    internal val exampleStopTransformationResponse =
        StopTransformationResponse.builder()
            .transformationStatus(TransformationStatus.STOPPED).build() as StopTransformationResponse

    internal val exampleGetCodeMigrationResponse =
        GetTransformationResponse.builder()
            .transformationJob(
                TransformationJob.builder()
                    .jobId(jobId.id)
                    .creationTime(Instant.now())
                    .startExecutionTime(Instant.now())
                    .endExecutionTime(null)
                    .status(TransformationStatus.ACCEPTED)
                    .transformationSpec(
                        TransformationSpec.builder()
                            .transformationType(TransformationType.LANGUAGE_UPGRADE)
                            .source(
                                TransformationProjectState.builder()
                                    .language(TransformationLanguage.JAVA_11)
                                    .build(),
                            )
                            .target(
                                TransformationProjectState.builder()
                                    .language(TransformationLanguage.JAVA_17)
                                    .build(),
                            )
                            .build(),
                    )
                    .build(),
            )
            .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(ResponseMetadata.AWS_REQUEST_ID to testRequestId)))
            .sdkHttpResponse(SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))).build())
            .build() as GetTransformationResponse

    internal val exampleExportResultArchiveResponse = mutableListOf(byteArrayOf(100))

    fun GetTransformationResponse.replace(status: TransformationStatus) =
        this.copy { response ->
            response.transformationJob(this.transformationJob().copy { it.status(status) })
                .responseMetadata(DefaultAwsResponseMetadata.create(mapOf(ResponseMetadata.AWS_REQUEST_ID to testRequestId)))
                .sdkHttpResponse(
                    SdkHttpResponse.builder().headers(mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))).build(),
                )
        }

    val happyPathMigrationResponses =
        listOf(
            exampleGetCodeMigrationResponse,
            exampleGetCodeMigrationResponse.replace(TransformationStatus.STARTED),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.PREPARING),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.PREPARED),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.PLANNING),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.PLANNED),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.TRANSFORMING),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.TRANSFORMED),
            exampleGetCodeMigrationResponse.replace(TransformationStatus.COMPLETED),
        )

    @Before
    open fun setup() {
        project = projectRule.project
        toolkitConnectionManager = spy(ToolkitConnectionManager.getInstance(project))

        val accessToken = DeviceAuthorizationGrantToken(aString(), aString(), aString(), aString(), Instant.MAX, Instant.now())
        val provider =
            mock<BearerTokenProvider> {
                doReturn(accessToken).whenever(it).refresh()
            }
        val mockBearerProvider =
            mock<ToolkitBearerTokenProvider> {
                doReturn(provider).whenever(it).delegate
            }
        val connectionSettingsMock =
            mock<TokenConnectionSettings> {
                whenever(it.tokenProvider).thenReturn(mockBearerProvider)
            }
        val toolkitConnection =
            mock<AwsBearerTokenConnection> {
                doReturn(connectionSettingsMock).whenever(it).getConnectionSettings()
            }
        doReturn(toolkitConnection).whenever(toolkitConnectionManager).activeConnectionForFeature(any())
        project.replaceService(ToolkitConnectionManager::class.java, toolkitConnectionManager, disposableRule.disposable)
        telemetryManagerSpy = spy(CodeTransformTelemetryManager.getInstance(project))
        project.replaceService(CodeTransformTelemetryManager::class.java, telemetryManagerSpy, disposableRule.disposable)
        clientAdaptorSpy = spy(GumbyClient.getInstance(project))
        project.replaceService(GumbyClient::class.java, clientAdaptorSpy, disposableRule.disposable)
        testSessionStateSpy = spy(CodeModernizerSessionState.getInstance(project))
        project.replaceService(CodeModernizerSessionState::class.java, testSessionStateSpy, disposableRule.disposable)

        codeModernizerManagerSpy = spy(CodeModernizerManager.getInstance(project))
        module = project.modules.firstOrNull() ?: if (projectRule is HeavyJavaCodeInsightTestFixtureRule) {
            projectRule.fixture.addModule("module1")
        } else {
            TODO()
        }

        val virtualFileMock = Mockito.mock(VirtualFile::class.java)
        val summaryFileMock = Mockito.mock(File::class.java)
        doReturn("dummy/path").whenever(virtualFileMock).path
        testSessionContextSpy = spy(CodeModernizerSessionContext(project, virtualFileMock, JavaSdkVersion.JDK_1_8, JavaSdkVersion.JDK_11))
        testSessionSpy = spy(CodeModernizerSession(testSessionContextSpy, 0, 0))
        doNothing().whenever(testSessionSpy).deleteUploadArtifact(any())
        doReturn(Job()).whenever(codeModernizerManagerSpy).launchModernizationJob(any(), any())
        doReturn(testSessionSpy).whenever(codeModernizerManagerSpy).createCodeModernizerSession(any(), any())
        testCodeModernizerArtifact =
            spy(
                CodeModernizerArtifact(
                    exampleZipPath.toAbsolutePath().toString(),
                    validManifest,
                    listOf(examplePatchVirtualFile),
                    validTransformationSummary,
                    summaryFileMock,
                ),
            )

        // Set up the bottom tool window mocks
        testModernizerBottomWindowPanelSpy = spy(CodeModernizerBottomWindowPanelManager(project))
        toolWindowMock =
            spy(
                ToolWindowManager.getInstance(project).registerToolWindow(
                    RegisterToolWindowTask(
                        id = CodeModernizerBottomToolWindowFactory.id,
                    ),
                ),
            )
        doReturn(toolWindowMock).whenever(codeModernizerManagerSpy).getBottomToolWindow()
        doNothing().whenever(codeModernizerManagerSpy).notifyTransformationStopped()
        doNothing().whenever(codeModernizerManagerSpy).notifyTransformationStartStopping()
        doNothing().whenever(codeModernizerManagerSpy).notifyTransformationFailedToStop()
    }

    companion object {
        fun String.toResourceFile(): File {
            val uri =
                CodeWhispererCodeModernizerTest::class.java.getResource("/codemodernizer/$this")?.toURI()
                    ?: throw AssertionError("Unable to locate test resource $this file.")
            return File(uri)
        }
    }
}
