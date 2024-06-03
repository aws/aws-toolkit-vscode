// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.psi.PsiFile
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.apache.commons.codec.digest.DigestUtils
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.ArgumentMatchers.anyString
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
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererLanguage
import java.io.File
import java.io.FileInputStream
import java.util.Base64
import java.util.UUID
import kotlin.io.path.relativeTo
import kotlin.test.assertNotNull

class CodeWhispererCodeScanTest : CodeWhispererCodeScanTestBase(PythonCodeInsightTestFixtureRule()) {
    private lateinit var psifile: PsiFile
    private lateinit var file: File
    private lateinit var sessionConfigSpy: CodeScanSessionConfig
    private val payloadContext = PayloadContext(CodewhispererLanguage.Python, 1, 1, 10, listOf(), 600, 200)
    private lateinit var codeScanSessionContext: CodeScanSessionContext
    private lateinit var codeScanSessionSpy: CodeWhispererCodeScanSession
    private val codeScanName = UUID.randomUUID().toString()

    @Before
    override fun setup() {
        super.setup()
        psifile = projectRule.fixture.addFileToProject(
            "/test.py",
            """import numpy as np
               import from module1 import helper
               
               def add(a, b):
                  return a + b
                  
            """.trimMargin()
        )
        file = psifile.virtualFile.toNioPath().toFile()

        sessionConfigSpy = spy(
            CodeScanSessionConfig.create(
                psifile.virtualFile,
                project,
                CodeWhispererConstants.CodeAnalysisScope.PROJECT
            )
        )
        setupResponse(psifile.virtualFile.toNioPath().relativeTo(sessionConfigSpy.projectRoot.toNioPath()))

        sessionConfigSpy.stub {
            onGeneric { sessionConfigSpy.createPayload() }.thenReturn(Payload(payloadContext, file))
        }

        // Mock CodeWhispererClient needs to be setup before initializing CodeWhispererCodeScanSession
        codeScanSessionContext = CodeScanSessionContext(project, sessionConfigSpy, CodeWhispererConstants.CodeAnalysisScope.PROJECT)
        codeScanSessionSpy = spy(CodeWhispererCodeScanSession(codeScanSessionContext))
        doNothing().`when`(codeScanSessionSpy).uploadArtifactToS3(any(), any(), any(), any(), isNull(), any())

        mockClient.stub {
            onGeneric { createUploadUrl(any()) }.thenReturn(fakeCreateUploadUrlResponse)
            onGeneric { createCodeScan(any(), any()) }.thenReturn(fakeCreateCodeScanResponse)
            onGeneric { getCodeScan(any(), any()) }.thenReturn(fakeGetCodeScanResponse)
            onGeneric { listCodeScanFindings(any(), any()) }.thenReturn(fakeListCodeScanFindingsResponse)
        }
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
    fun `test createUploadUrlAndUpload() with invalid source zip file`() {
        val invalidZipFile = File("/path/file.zip")

        assertThrows<CodeWhispererCodeScanException> {
            codeScanSessionSpy.createUploadUrlAndUpload(invalidZipFile, "artifactType", codeScanName)
        }
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
    fun `test mapToCodeScanIssues - handles index out of bounds`() {
        val recommendations = listOf(
            fakeListCodeScanFindingsOutOfBoundsIndexResponse.codeScanFindings(),
        )
        val res = codeScanSessionSpy.mapToCodeScanIssues(recommendations)
        assertThat(res).hasSize(1)
    }

    @Test
    fun `test run() - happypath`() {
        assertNotNull(sessionConfigSpy)
        runBlocking {
            val codeScanResponse = codeScanSessionSpy.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Success>()
            assertThat(codeScanResponse.issues).hasSize(2)
            assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
            assertThat(codeScanResponse.responseContext.codeScanJobId).isEqualTo("jobId")
        }

        val inOrder = inOrder(codeScanSessionSpy)
        inOrder.verify(codeScanSessionSpy, Times(1)).createUploadUrlAndUpload(eq(file), eq("SourceCode"), anyString())
        inOrder.verify(codeScanSessionSpy, Times(1)).createCodeScan(eq(CodewhispererLanguage.Python.toString()), anyString())
        inOrder.verify(codeScanSessionSpy, Times(1)).getCodeScan(any())
        inOrder.verify(codeScanSessionSpy, Times(1)).listCodeScanFindings(eq("jobId"), eq(null))
    }

    @Test
    fun `test run() - code scans limit reached`() {
        assertNotNull(sessionConfigSpy)

        mockClient.stub {
            onGeneric { codeScanSessionSpy.createUploadUrlAndUpload(any(), any(), any()) }.thenThrow(
                CodeWhispererException.builder()
                    .message("Project Scan Monthly Exceeded")
                    .requestId("abc123")
                    .statusCode(400)
                    .cause(RuntimeException("Something went wrong"))
                    .writableStackTrace(true)
                    .awsErrorDetails(
                        AwsErrorDetails.builder()
                            .errorCode("ThrottlingException")
                            .errorMessage("Maximum full project scan count reached for this month")
                            .serviceName("CodeWhispererService")
                            .build()
                    )
                    .build()
            )
        }
        runBlocking {
            val codeScanResponse = codeScanSessionSpy.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
            if (codeScanResponse is CodeScanResponse.Failure) {
                assertThat(codeScanResponse.failureReason).isInstanceOf<CodeWhispererException>()
                assertThat(codeScanResponse.failureReason.toString()).contains("Project Scan Monthly Exceeded")
                assertThat(codeScanResponse.failureReason.cause.toString()).contains("java.lang.RuntimeException: Something went wrong")
            }
        }
    }

    @Test
    fun `test run() - createCodeScan failed`() {
        mockClient.stub {
            onGeneric { createCodeScan(any(), any()) }.thenReturn(fakeCreateCodeScanResponseFailed)
        }

        runBlocking {
            val codeScanResponse = codeScanSessionSpy.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
            assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
            assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<Exception>()
        }
    }

    @Test
    fun `test run() - createCodeScan error`() {
        mockClient.stub {
            onGeneric { createCodeScan(any(), any()) }.thenThrow(CodeWhispererCodeScanServerException::class.java)
        }

        runBlocking {
            val codeScanResponse = codeScanSessionSpy.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
            assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
            assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<CodeWhispererCodeScanServerException>()
        }
    }

    @Test
    fun `test run() - getCodeScan failed`() {
        mockClient.stub {
            onGeneric { getCodeScan(any(), any()) }.thenReturn(fakeGetCodeScanResponseFailed)
        }

        runBlocking {
            val codeScanResponse = codeScanSessionSpy.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
            assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
            assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<Exception>()
        }
    }

    @Test
    fun `test run() - getCodeScan pending timeout`() {
        sessionConfigSpy.stub {
            onGeneric { overallJobTimeoutInSeconds() }.thenReturn(5)
        }
        mockClient.stub {
            onGeneric { getCodeScan(any(), any()) }.thenAnswer {
                runBlocking {
                    delay(TIMEOUT)
                }
                fakeGetCodeScanResponsePending
            }
        }

        runBlocking {
            val codeScanResponse = codeScanSessionSpy.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
            assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
            assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<WaiterTimeoutException>()
        }
    }

    @Test
    fun `test run() - getCodeScan error`() {
        mockClient.stub {
            onGeneric { getCodeScan(any(), any()) }.thenThrow(CodeWhispererCodeScanServerException::class.java)
        }

        runBlocking {
            val codeScanResponse = codeScanSessionSpy.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
            assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
            assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<CodeWhispererCodeScanServerException>()
        }
    }

    @Test
    fun `test run() - listCodeScanFindings error`() {
        mockClient.stub {
            onGeneric { listCodeScanFindings(any(), any()) }.thenThrow(CodeWhispererCodeScanServerException::class.java)
        }

        runBlocking {
            val codeScanResponse = codeScanSessionSpy.run()
            assertThat(codeScanResponse).isInstanceOf<CodeScanResponse.Failure>()
            assertThat(codeScanResponse.responseContext.payloadContext).isEqualTo(payloadContext)
            assertThat((codeScanResponse as CodeScanResponse.Failure).failureReason).isInstanceOf<CodeWhispererCodeScanServerException>()
        }
    }

    companion object {
        const val TIMEOUT = 10L * TOTAL_MILLIS_IN_SECOND
    }
}
