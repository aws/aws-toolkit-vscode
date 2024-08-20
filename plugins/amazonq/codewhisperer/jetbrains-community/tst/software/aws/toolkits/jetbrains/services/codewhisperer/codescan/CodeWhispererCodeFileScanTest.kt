// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiFile
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.apache.commons.codec.digest.DigestUtils
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito
import org.mockito.Mockito.mock
import org.mockito.Mockito.times
import org.mockito.Mockito.`when`
import org.mockito.internal.verification.Times
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.eq
import org.mockito.kotlin.inOrder
import org.mockito.kotlin.isNull
import org.mockito.kotlin.spy
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.services.codewhisperer.model.CodeWhispererException
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.aws.toolkits.core.utils.WaiterTimeoutException
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.CodeScanSessionConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.Payload
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.sessionconfig.PayloadContext
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.TOTAL_MILLIS_IN_SECOND
import software.aws.toolkits.jetbrains.utils.isInstanceOf
import software.aws.toolkits.jetbrains.utils.isInstanceOfSatisfying
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.File
import java.io.FileInputStream
import java.lang.management.ManagementFactory
import java.util.Base64
import java.util.UUID
import java.util.zip.ZipFile
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererCodeFileScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {
    private lateinit var psifile: PsiFile
    private lateinit var psifile2: PsiFile
    private lateinit var psifile3: PsiFile
    private lateinit var psifile4: PsiFile
    private lateinit var psifilePerformanceTest: PsiFile
    private lateinit var psifilePerformanceTest2: PsiFile
    private lateinit var file: File
    private lateinit var file2: File
    private lateinit var file3: File
    private lateinit var file4: File
    private lateinit var performanceTestfileWithPayload200KB: File
    private lateinit var performanceTestfileWithPayload150KB: File
    private lateinit var virtualFile3: VirtualFile
    private lateinit var virtualFile4: VirtualFile
    private lateinit var sessionConfigSpy: CodeScanSessionConfig
    private lateinit var sessionConfigSpy2: CodeScanSessionConfig
    private lateinit var sessionConfigSpy3: CodeScanSessionConfig
    private lateinit var sessionConfigSpy4: CodeScanSessionConfig
    private val payloadContext = PayloadContext(CodewhispererLanguage.Python, 1, 1, 10, listOf(), 600, 200)
    private lateinit var codeScanSessionContext: CodeScanSessionContext
    private lateinit var codeScanSessionContext2: CodeScanSessionContext
    private lateinit var codeScanSessionContext3: CodeScanSessionContext
    private lateinit var codeScanSessionSpy: CodeWhispererCodeScanSession
    private lateinit var codeScanSessionSpy2: CodeWhispererCodeScanSession
    private lateinit var codeScanSessionSpy3: CodeWhispererCodeScanSession
    private val codeScanName = UUID.randomUUID().toString()

    @Before
    override fun setup() {
        super.setup()

        psifile2 = projectRule.fixture.addFileToProject(
            "/subtract.java",
            """public class MathOperations {
                public static int subtract(int a, int b) {
                    return a - b; 
                    }
                public static void main(String[] args) {    
                    int num1 = 10;
                    int num2 = 5;
                    int result = subtract(num1, num2);
                    System.out.println(result);
                    }
                }     
            """.trimMargin()
        )
        file2 = psifile2.virtualFile.toNioPath().toFile()

        psifile = projectRule.fixture.addFileToProject(
            "/test.py",
            """import numpy as np
               import from module1 import helper
               
               def add(a, b):
                  return a + b
                  
            """.trimMargin()
        )
        file = psifile.virtualFile.toNioPath().toFile()

        psifile3 = projectRule.fixture.addFileToProject(
            "/test.kt",
            // write simple addition function in kotlin
            """
                fun main() {
                    val a = 1
                    val b = 2
                    val c = a + b
                    println(c)
                }
            """.trimMargin()
        )
        virtualFile3 = psifile3.virtualFile
        file3 = virtualFile3.toNioPath().toFile()

        psifile4 = projectRule.fixture.addFileToProject(
            "../test.java",
            """
                public class Addition {
                    public static void main(String[] args) {
                        int a = 1;
                        int b = 2;
                        int c = a + b;
                        System.out.println(c);
                    }
                }
                """
        )
        virtualFile4 = psifile4.virtualFile
        file4 = virtualFile4.toNioPath().toFile()

        // Create a 200KB file
        val content = "a".repeat(200 * 1024)
        psifilePerformanceTest = projectRule.fixture.addFileToProject("test.txt", content)
        performanceTestfileWithPayload200KB = psifilePerformanceTest.virtualFile.toNioPath().toFile()

        sessionConfigSpy3 = spy(
            CodeScanSessionConfig.create(
                psifilePerformanceTest.virtualFile,
                project,
                CodeWhispererConstants.CodeAnalysisScope.FILE
            )
        )
        setupResponse(psifilePerformanceTest.virtualFile.toNioPath().relativeTo(sessionConfigSpy3.projectRoot.toNioPath()))

        // Create a 150KB file
        val codeContentForPayload = "a".repeat(150 * 1024)
        psifilePerformanceTest2 = projectRule.fixture.addFileToProject("test.txt", codeContentForPayload)
        performanceTestfileWithPayload150KB = psifilePerformanceTest2.virtualFile.toNioPath().toFile()

        sessionConfigSpy4 = spy(
            CodeScanSessionConfig.create(
                psifilePerformanceTest2.virtualFile,
                project,
                CodeWhispererConstants.CodeAnalysisScope.FILE
            )
        )
        setupResponse(psifilePerformanceTest2.virtualFile.toNioPath().relativeTo(sessionConfigSpy4.projectRoot.toNioPath()))
        sessionConfigSpy = spy(
            CodeScanSessionConfig.create(
                psifile.virtualFile,
                project,
                CodeWhispererConstants.CodeAnalysisScope.FILE
            )
        )

        sessionConfigSpy2 = spy(
            CodeScanSessionConfig.create(
                virtualFile4,
                project,
                CodeWhispererConstants.CodeAnalysisScope.FILE
            )
        )

        setupResponse(psifile.virtualFile.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

        sessionConfigSpy.stub {
            onGeneric { sessionConfigSpy.createPayload() }.thenReturn(Payload(payloadContext, file))
        }

        // Mock CodeWhispererClient needs to be setup before initializing CodeWhispererCodeScanSession
        codeScanSessionContext = CodeScanSessionContext(project, sessionConfigSpy, CodeWhispererConstants.CodeAnalysisScope.FILE)
        codeScanSessionSpy = spy(CodeWhispererCodeScanSession(codeScanSessionContext))
        doNothing().`when`(codeScanSessionSpy).uploadArtifactToS3(any(), any(), any(), any(), isNull(), any())

        codeScanSessionContext2 = CodeScanSessionContext(project, sessionConfigSpy3, CodeWhispererConstants.CodeAnalysisScope.FILE)
        codeScanSessionSpy2 = spy(CodeWhispererCodeScanSession(codeScanSessionContext2))
        doNothing().`when`(codeScanSessionSpy2).uploadArtifactToS3(any(), any(), any(), any(), isNull(), any())

        codeScanSessionContext3 = CodeScanSessionContext(project, sessionConfigSpy4, CodeWhispererConstants.CodeAnalysisScope.FILE)
        codeScanSessionSpy3 = spy(CodeWhispererCodeScanSession(codeScanSessionContext3))
        doNothing().`when`(codeScanSessionSpy3).uploadArtifactToS3(any(), any(), any(), any(), isNull(), any())
        mockClient.stub {
            onGeneric { createUploadUrl(any()) }.thenReturn(fakeCreateUploadUrlResponse)
            onGeneric { createCodeScan(any(), any()) }.thenReturn(fakeCreateCodeScanResponse)
            onGeneric { getCodeScan(any(), any()) }.thenReturn(fakeGetCodeScanResponse)
            onGeneric { listCodeScanFindings(any(), any()) }.thenReturn(fakeListCodeScanFindingsResponse)
        }
    }

    @Test
    fun `test run() - measure CPU and memory usage`() {
        // Set up CPU and Memory monitoring
        val runtime = Runtime.getRuntime()
        val bean = ManagementFactory.getThreadMXBean()
        val startCpuTime = bean.getCurrentThreadCpuTime()
        val startMemoryUsage = runtime.totalMemory() - runtime.freeMemory()
        val startSystemTime = System.nanoTime()

        // Run the code scan
        runBlocking {
            codeScanSessionSpy2.run()
        }

        // Calculate CPU and memory usage
        val endCpuTime = bean.getCurrentThreadCpuTime()
        val endMemoryUsage = runtime.totalMemory() - runtime.freeMemory()
        val endSystemTime = System.nanoTime()

        val cpuTimeUsedNanos = endCpuTime - startCpuTime
        val cpuTimeUsedSeconds = cpuTimeUsedNanos / 1_000_000_000.0
        val elapsedTimeSeconds = (endSystemTime - startSystemTime) / 1_000_000_000.0

        val memoryUsed = endMemoryUsage - startMemoryUsage
        val memoryUsedInMB = memoryUsed / (1024.0 * 1024.0) // Converting into MB

        // Calculate CPU usage in percentage
        val cpuUsagePercentage = (cpuTimeUsedSeconds / elapsedTimeSeconds) * 100

        assertThat(cpuTimeUsedSeconds).isLessThan(5.0)
        assertThat(cpuUsagePercentage).isLessThan(30.0)
        assertThat(memoryUsedInMB).isLessThan(200.0) // Memory used should be less than 200MB
    }

    @Test
    fun `test run() - measure CPU and memory usage with payload of 150KB`() {
        // Set up CPU and Memory monitoring
        val runtime = Runtime.getRuntime()
        val bean = ManagementFactory.getThreadMXBean()
        val startCpuTime = bean.getCurrentThreadCpuTime()
        val startMemoryUsage = runtime.totalMemory() - runtime.freeMemory()
        val startSystemTime = System.nanoTime()

        // Run the code scan
        runBlocking {
            codeScanSessionSpy3.run()
        }

        // Calculate CPU and memory usage
        val endCpuTime = bean.getCurrentThreadCpuTime()
        val endMemoryUsage = runtime.totalMemory() - runtime.freeMemory()
        val endSystemTime = System.nanoTime()

        val cpuTimeUsedNanos = endCpuTime - startCpuTime
        val cpuTimeUsedSeconds = cpuTimeUsedNanos / 1_000_000_000.0
        val elapsedTimeSeconds = (endSystemTime - startSystemTime) / 1_000_000_000.0

        val memoryUsed = endMemoryUsage - startMemoryUsage
        val memoryUsedInMB = memoryUsed / (1024.0 * 1024.0) // Converting into MB

        // Calculate CPU usage in percentage
        val cpuUsagePercentage = (cpuTimeUsedSeconds / elapsedTimeSeconds) * 100

        assertThat(cpuTimeUsedSeconds).isLessThan(5.0)
        assertThat(cpuUsagePercentage).isLessThan(30.0)
        assertThat(memoryUsedInMB).isLessThan(200.0) // Memory used should be less than 200MB
    }

    @Test
    fun `test createUploadUrlAndUpload()`() {
        val fileMd5: String = Base64.getEncoder().encodeToString(DigestUtils.md5(FileInputStream(file)))
        codeScanSessionSpy.stub {
            onGeneric { codeScanSessionSpy.createUploadUrl(any(), any(), any()) }
                .thenReturn(fakeCreateUploadUrlResponse)
        }

        codeScanSessionSpy.createUploadUrlAndUpload(file, "artifactType", codeScanName)

        val inOrder = inOrder(codeScanSessionSpy)
        inOrder.verify(codeScanSessionSpy).createUploadUrl(eq(fileMd5), eq("artifactType"), any())
        inOrder.verify(codeScanSessionSpy).uploadArtifactToS3(
            eq(fakeCreateUploadUrlResponse.uploadUrl()),
            eq(fakeCreateUploadUrlResponse.uploadId()),
            eq(file),
            eq(fileMd5),
            eq(null),
            any()
        )
    }

    @Test
    fun `test createUploadUrl()`() {
        val response = codeScanSessionSpy.createUploadUrl("md5", "type", codeScanName)

        argumentCaptor<CreateUploadUrlRequest>().apply {
            verify(mockClient).createUploadUrl(capture())
            assertThat(response.uploadUrl()).isEqualTo(s3endpoint)
            assertThat(response.uploadId()).isEqualTo(UPLOAD_ID)
            assertThat(firstValue.contentMd5()).isEqualTo("md5")
            assertThat(firstValue.artifactTypeAsString()).isEqualTo("type")
        }
    }

    @Test
    fun `test mapToCodeScanIssues`() {
        val recommendations = listOf(
            fakeListCodeScanFindingsResponse.codeScanFindings(),
            getFakeRecommendationsOnNonExistentFile()
        )
        val res = codeScanSessionSpy.mapToCodeScanIssues(recommendations)
        assertThat(res).hasSize(2)
    }

    @Test
    fun `test run() - happypath`() = runTest {
        assertNotNull(sessionConfigSpy)
        val codeScanResponse = codeScanSessionSpy.run()
        assertThat(codeScanResponse).isInstanceOfSatisfying<CodeScanResponse.Success> {
            assertThat(it.issues).hasSize(2)
            assertThat(it.responseContext.payloadContext).isEqualTo(payloadContext)
            assertThat(it.responseContext.codeScanJobId).isEqualTo("jobId")
        }

        val inOrder = inOrder(codeScanSessionSpy)
        inOrder.verify(codeScanSessionSpy, Times(1)).createUploadUrlAndUpload(eq(file), eq("SourceCode"), anyString())
        inOrder.verify(codeScanSessionSpy, Times(1)).createCodeScan(eq(CodewhispererLanguage.Python.toString()), anyString())
        inOrder.verify(codeScanSessionSpy, Times(1)).getCodeScan(any())
        inOrder.verify(codeScanSessionSpy, Times(1)).listCodeScanFindings(eq("jobId"), eq(null))
    }

    @Test
    fun `test createPayload for files outside Project Root`() {
        val payload = sessionConfigSpy2.createPayload()
        assertNotNull(payload)
        val payloadZipFile = ZipFile(payload.srcZip)
        for (entry in payloadZipFile.entries()) {
            assertThat(!entry.name.startsWith(".."))
        }
    }

    @Test
    fun `unsupported languages file scan fail`() = runTest {
        scanManagerSpy = Mockito.spy(CodeWhispererCodeScanManager.getInstance(projectRule.project))
        projectRule.project.replaceService(CodeWhispererCodeScanManager::class.java, scanManagerSpy, disposableRule.disposable)

        val fileEditorManager = mock(FileEditorManager::class.java)
        val selectedEditor = mock(FileEditor::class.java)
        val editorList: MutableList<FileEditor> = mutableListOf(selectedEditor)

        `when`(fileEditorManager.selectedEditorWithRemotes).thenReturn(editorList)
        `when`(fileEditorManager.selectedEditor).thenReturn(selectedEditor)
        `when`(selectedEditor.file).thenReturn(virtualFile3)

        scanManagerSpy.runCodeScan(CodeWhispererConstants.CodeAnalysisScope.FILE)
        // verify that function was run but none of the results/error handling methods were called.
        verify(scanManagerSpy, times(0)).updateFileIssues(any(), any())
        verify(scanManagerSpy, times(0)).handleError(any(), any(), any())
        verify(scanManagerSpy, times(0)).handleException(any(), any(), any())
    }

    @Test
    fun `test run() - file scans limit reached`() = runTest {
        assertNotNull(sessionConfigSpy)

        mockClient.stub {
            onGeneric { codeScanSessionSpy.createUploadUrlAndUpload(any(), any(), any()) }.thenThrow(
                CodeWhispererException.builder()
                    .message("File Scan Monthly Exceeded")
                    .requestId("abc123")
                    .statusCode(400)
                    .cause(RuntimeException("Something went wrong"))
                    .writableStackTrace(true)
                    .awsErrorDetails(
                        AwsErrorDetails.builder()
                            .errorCode("ThrottlingException")
                            .errorMessage("Maximum automatic file scan count reached for this month")
                            .serviceName("CodeWhispererService")
                            .build()
                    )
                    .build()
            )
        }
        val codeScanResponse = codeScanSessionSpy.run()
        assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
        if (codeScanResponse is CodeScanResponse.Failure) {
            assertThat(codeScanResponse.failureReason).isInstanceOf<CodeWhispererException>()
            assertThat(codeScanResponse.failureReason.toString()).contains("File Scan Monthly Exceeded")
            assertThat(codeScanResponse.failureReason.cause.toString()).contains("java.lang.RuntimeException: Something went wrong")
        }
    }

    @Test
    fun `test run() - createCodeScan failed`() = runTest {
        mockClient.stub {
            onGeneric { createCodeScan(any(), any()) }.thenReturn(fakeCreateCodeScanResponseFailed)
        }

        val codeScanResponse = codeScanSessionSpy.run()
        assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
        assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
        assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<Exception>()
    }

    @Test
    fun `test run() - createCodeScan error`() = runTest {
        mockClient.stub {
            onGeneric { createCodeScan(any(), any()) }.thenThrow(CodeWhispererCodeScanServerException::class.java)
        }

        val codeScanResponse = codeScanSessionSpy.run()
        assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
        assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
        assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<CodeWhispererCodeScanServerException>()
    }

    @Test
    fun `test run() - getCodeScan failed`() = runTest {
        mockClient.stub {
            onGeneric { getCodeScan(any(), any()) }.thenReturn(fakeGetCodeScanResponseFailed)
        }

        val codeScanResponse = codeScanSessionSpy.run()
        assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
        assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
        assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<Exception>()
    }

    @Test
    fun `test run() - getCodeScan pending timeout`() = runTest {
        sessionConfigSpy.stub {
            onGeneric { overallJobTimeoutInSeconds() }.thenReturn(5)
        }
        mockClient.stub {
            onGeneric { getCodeScan(any(), any()) }.thenAnswer {
                Thread.sleep(TIMEOUT)
                fakeGetCodeScanResponsePending
            }
        }

        val codeScanResponse = codeScanSessionSpy.run()
        assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
        assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
        assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<WaiterTimeoutException>()
    }

    @Test
    fun `test run() - getCodeScan error`() = runTest {
        mockClient.stub {
            onGeneric { getCodeScan(any(), any()) }.thenThrow(CodeWhispererCodeScanServerException::class.java)
        }

        val codeScanResponse = codeScanSessionSpy.run()
        assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
        assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
        assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<CodeWhispererCodeScanServerException>()
    }

    @Test
    fun `test run() - listCodeScanFindings error`() = runTest {
        mockClient.stub {
            onGeneric { listCodeScanFindings(any(), any()) }.thenThrow(CodeWhispererCodeScanServerException::class.java)
        }

        val codeScanResponse = codeScanSessionSpy.run()
        assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
        assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
        assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<CodeWhispererCodeScanServerException>()
    }

    companion object {
        const val TIMEOUT = 10L * TOTAL_MILLIS_IN_SECOND
    }
}
