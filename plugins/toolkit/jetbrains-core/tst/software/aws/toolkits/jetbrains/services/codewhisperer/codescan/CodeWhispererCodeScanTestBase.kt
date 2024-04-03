// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.github.tomakehurst.wiremock.core.WireMockConfiguration
import com.github.tomakehurst.wiremock.junit.WireMockRule
import com.intellij.analysis.problemsView.toolWindow.ProblemsView
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.wm.RegisterToolWindowTask
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.ApplicationRule
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.replaceService
import com.intellij.util.io.systemIndependentPath
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.gradle.internal.impldep.com.amazonaws.ResponseMetadata
import org.junit.Before
import org.junit.Rule
import org.junit.jupiter.api.assertThrows
import org.mockito.kotlin.any
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.isNull
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import org.mockito.kotlin.whenever
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.services.codewhisperer.model.CodeScanStatus
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererLoginType
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import software.aws.toolkits.jetbrains.utils.rules.CodeInsightTestFixtureRule
import java.nio.file.Path
import kotlin.test.assertNotNull

open class CodeWhispererCodeScanTestBase(projectRule: CodeInsightTestFixtureRule) {
    @Rule
    @JvmField
    val applicationRule = ApplicationRule()

    @Rule
    @JvmField
    val projectRule: CodeInsightTestFixtureRule = projectRule

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Rule
    @JvmField
    val mockClientManagerRule = MockClientManagerRule()

    @Rule
    @JvmField
    val wireMock = WireMockRule(WireMockConfiguration.wireMockConfig().dynamicPort())

    protected lateinit var mockClient: CodeWhispererClientAdaptor

    internal lateinit var s3endpoint: String

    internal lateinit var fakeCreateUploadUrlResponse: CreateUploadUrlResponse
    internal lateinit var fakeCreateCodeScanResponse: CreateCodeScanResponse
    internal lateinit var fakeCreateCodeScanResponseFailed: CreateCodeScanResponse
    internal lateinit var fakeCreateCodeScanResponsePending: CreateCodeScanResponse
    internal lateinit var fakeListCodeScanFindingsResponse: ListCodeScanFindingsResponse
    internal lateinit var fakeGetCodeScanResponse: GetCodeScanResponse
    internal lateinit var fakeGetCodeScanResponsePending: GetCodeScanResponse
    internal lateinit var fakeGetCodeScanResponseFailed: GetCodeScanResponse

    internal val metadata: DefaultAwsResponseMetadata = DefaultAwsResponseMetadata.create(
        mapOf(ResponseMetadata.AWS_REQUEST_ID to CodeWhispererTestUtil.testRequestId)
    )

    internal lateinit var scanManagerSpy: CodeWhispererCodeScanManager
    internal lateinit var project: Project

    @Before
    open fun setup() {
        project = projectRule.project
        s3endpoint = "http://127.0.0.1:${wireMock.port()}"

        scanManagerSpy = spy(CodeWhispererCodeScanManager.getInstance(project))
        doNothing().whenever(scanManagerSpy).addCodeScanUI(any())

        mockClient = mock<CodeWhispererClientAdaptor>().also {
            project.replaceService(CodeWhispererClientAdaptor::class.java, it, disposableRule.disposable)
        }

        ApplicationManager.getApplication().replaceService(
            CodeWhispererExplorerActionManager::class.java,
            mock {
                on { checkActiveCodeWhispererConnectionType(any()) } doReturn CodeWhispererLoginType.Accountless
            },
            disposableRule.disposable
        )
    }

    private fun setupCodeScanFindings(filePath: Path) = """
        [
            {
                "filePath": "${filePath.systemIndependentPath}",
                "startLine": 1,
                "endLine": 2,
                "title": "test",
                "description": {
                    "text": "global variable",
                    "markdown": "### global variable"
                },
                "detectorId": "detectorId",
                "detectorName": "detectorName",
                "findingId": "findingId",
                "relatedVulnerabilities": [],
                "severity": "severity",
                "remediation": {
                    "recommendation": {
                        "text": "recommendationText",
                        "url": "recommendationUrl"
                    },
                    "suggestedFixes": []
                }
            },
            {
                "filePath": "${filePath.systemIndependentPath}",
                "startLine": 1,
                "endLine": 2,
                "title": "test",
                "description": {
                    "text": "global variable",
                    "markdown": "### global variable"
                },
                "detectorId": "detectorId",
                "detectorName": "detectorName",
                "findingId": "findingId",
                "relatedVulnerabilities": [],
                "severity": "severity",
                "remediation": {
                    "recommendation": {
                        "text": "recommendationText",
                        "url": "recommendationUrl"
                    },
                    "suggestedFixes": []
                }
            }
        ]
    """

    protected fun setupResponse(filePath: Path) {
        fakeCreateUploadUrlResponse = CreateUploadUrlResponse.builder()
            .uploadId(UPLOAD_ID)
            .uploadUrl(s3endpoint)
            .responseMetadata(metadata)
            .build() as CreateUploadUrlResponse

        fakeCreateCodeScanResponse = CreateCodeScanResponse.builder()
            .status(CodeScanStatus.COMPLETED)
            .jobId(JOB_ID)
            .responseMetadata(metadata)
            .build() as CreateCodeScanResponse

        fakeCreateCodeScanResponseFailed = CreateCodeScanResponse.builder()
            .status(CodeScanStatus.FAILED)
            .jobId(JOB_ID)
            .responseMetadata(metadata)
            .build() as CreateCodeScanResponse

        fakeCreateCodeScanResponsePending = CreateCodeScanResponse.builder()
            .status(CodeScanStatus.PENDING)
            .jobId(JOB_ID)
            .responseMetadata(metadata)
            .build() as CreateCodeScanResponse

        fakeListCodeScanFindingsResponse = ListCodeScanFindingsResponse.builder()
            .codeScanFindings(setupCodeScanFindings(filePath))
            .responseMetadata(metadata)
            .build() as ListCodeScanFindingsResponse

        fakeGetCodeScanResponse = GetCodeScanResponse.builder()
            .status(CodeScanStatus.COMPLETED)
            .responseMetadata(metadata)
            .build() as GetCodeScanResponse

        fakeGetCodeScanResponsePending = GetCodeScanResponse.builder()
            .status(CodeScanStatus.PENDING)
            .responseMetadata(metadata)
            .build() as GetCodeScanResponse

        fakeGetCodeScanResponseFailed = GetCodeScanResponse.builder()
            .status(CodeScanStatus.FAILED)
            .responseMetadata(metadata)
            .build() as GetCodeScanResponse
    }

    protected fun getFakeRecommendationsOnNonExistentFile() = """
        [
            {
                "filePath": "non-exist.py",
                "startLine": 1,
                "endLine": 2,
                "title": "test",
                "description": {
                    "text": "global variable",
                    "markdown": "### global variable"
                },
                "detectorId": "detectorId",
                "detectorName": "detectorName",
                "findingId": "findingId",
                "relatedVulnerabilities": [],
                "severity": "severity",
                "remediation": {
                    "recommendation": {
                        "text": "recommendationText",
                        "url": "recommendationUrl"
                    },
                    "suggestedFixes": []
                }
            }
        ]                
    """
    internal fun getSourceFilesUnderProjectRoot(sessionConfigSpy: CodeScanSessionConfig, testFile: VirtualFile, size: Int) = assertThat(
        sessionConfigSpy.getSourceFilesUnderProjectRoot(testFile, CodeWhispererConstants.SecurityScanType.PROJECT).size
    ).isEqualTo(size)

    internal fun getSourceFilesUnderProjectRootForFileScan(
        sessionConfigSpy: CodeScanSessionConfig,
        testFile: VirtualFile
    ) = assertThat(
        sessionConfigSpy.getSourceFilesUnderProjectRoot(testFile, CodeWhispererConstants.SecurityScanType.FILE).size
    ).isEqualTo(1)

    internal fun getTotalProjectSizeInBytes(sessionConfigSpy: CodeScanSessionConfig, totalSize: Long) = runBlocking {
        assertThat(sessionConfigSpy.getTotalProjectSizeInBytes()).isEqualTo(totalSize)
    }

    internal fun selectedFileLargerThanPayloadSizeThrowsException(sessionConfigSpy: CodeScanSessionConfig) {
        sessionConfigSpy.stub {
            onGeneric { getPayloadLimitInBytes() }.thenReturn(100)
        }
        assertThrows<CodeWhispererCodeScanException> {
            sessionConfigSpy.createPayload()
        }
    }

    internal fun includeDependencies(
        sessionConfigSpy: CodeScanSessionConfig,
        includedSourceFilesSize: Long,
        totalSize: Long,
        expectedTotalLines: Long,
        expectedBuilds: Int
    ) {
        val payloadMetadata = sessionConfigSpy.includeDependencies()
        assertNotNull(payloadMetadata)
        val (includedSourceFiles, srcPayloadSize, totalLines) = payloadMetadata
        assertThat(includedSourceFiles.size).isEqualTo(includedSourceFilesSize)
        assertThat(srcPayloadSize).isEqualTo(totalSize)
        assertThat(totalLines).isEqualTo(expectedTotalLines)
        assertThat(sessionConfigSpy.isProjectTruncated()).isFalse
        assertThat(payloadMetadata.buildPaths).hasSize(expectedBuilds)
    }

    internal fun assertE2ERunsSuccessfully(
        sessionConfigSpy: CodeScanSessionConfig,
        project: Project,
        expectedTotalLines: Long,
        expectedTotalFiles: Int,
        expectedTotalSize: Long,
        expectedTotalIssues: Int
    ) {
        val codeScanContext = CodeScanSessionContext(project, sessionConfigSpy)
        val sessionMock = spy(CodeWhispererCodeScanSession(codeScanContext))
        doNothing().`when`(sessionMock).uploadArtifactToS3(any(), any(), any(), any(), isNull())
        doNothing().`when`(sessionMock).sleepThread()

        ToolWindowManager.getInstance(project).registerToolWindow(
            RegisterToolWindowTask(
                id = ProblemsView.ID
            )
        )

        runBlocking {
            val codeScanResponse = sessionMock.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Success>()
            assertThat(codeScanResponse.issues).hasSize(expectedTotalIssues)
            assertThat(codeScanResponse.responseContext.codeScanJobId).isEqualTo("jobId")
            val payloadContext = codeScanResponse.responseContext.payloadContext
            assertThat(payloadContext.totalLines).isEqualTo(expectedTotalLines)
            assertThat(payloadContext.totalFiles).isEqualTo(expectedTotalFiles)
            assertThat(payloadContext.srcPayloadSize).isEqualTo(expectedTotalSize)
            scanManagerSpy.testRenderResponseOnUIThread(
                codeScanResponse.issues,
                codeScanResponse.responseContext.payloadContext.scannedFiles,
                sessionConfigSpy.isProjectTruncated()
            )
            assertNotNull(scanManagerSpy.getScanTree().model)
            val treeModel = scanManagerSpy.getScanTree().model as? CodeWhispererCodeScanTreeModel
            assertNotNull(treeModel)
            assertThat(treeModel.getTotalIssuesCount()).isEqualTo(expectedTotalIssues)
        }
    }

    companion object {
        const val UPLOAD_ID = "uploadId"
        const val JOB_ID = "jobId"
    }
}
