// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doReturnConsecutively
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.verifyNoInteractions
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.codewhisperer.CodeWhispererClient
import software.amazon.awssdk.services.codewhisperer.model.ArtifactType
import software.amazon.awssdk.services.codewhisperer.model.CodeScanFindingsSchema
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanUploadUrlRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateCodeScanUploadUrlResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhisperer.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisStatus
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisResponse
import software.amazon.awssdk.services.codewhispererruntime.paginators.GenerateCompletionsIterable
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.BearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ManagedSsoProfile
import software.aws.toolkits.jetbrains.core.credentials.MockCredentialManagerRule
import software.aws.toolkits.jetbrains.core.credentials.MockToolkitAuthManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.sono.SONO_REGION
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.metadata
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonRequest
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponseWithToken
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.sdkHttpResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptorImpl

class CodeWhispererClientAdaptorTest {
    val projectRule = ProjectRule()
    val disposableRule = DisposableRule()
    val mockClientManagerRule = MockClientManagerRule()
    val mockCredentialRule = MockCredentialManagerRule()
    val authManagerRule = MockToolkitAuthManagerRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, mockCredentialRule, mockClientManagerRule, disposableRule)

    private lateinit var sigv4Client: CodeWhispererClient
    private lateinit var bearerClient: CodeWhispererRuntimeClient
    private lateinit var ssoClient: SsoOidcClient

    private lateinit var sut: CodeWhispererClientAdaptor
    private lateinit var connectionManager: ToolkitConnectionManager

    @Before
    fun setup() {
        sut = CodeWhispererClientAdaptorImpl(projectRule.project)
        ssoClient = mockClientManagerRule.create()

        sigv4Client = mockClientManagerRule.create<CodeWhispererClient>().stub {
            on { createCodeScanUploadUrl(any<CreateCodeScanUploadUrlRequest>()) } doReturn createCodeScanUploadUrlResponse
            on { createCodeScan(any<CreateCodeScanRequest>()) } doReturn createCodeScanResponse
            on { getCodeScan(any<GetCodeScanRequest>()) } doReturn getCodeScanResponse
            on { listCodeScanFindings(any<ListCodeScanFindingsRequest>()) } doReturn listCodeScanFindingsResponse
        }

        bearerClient = mockClientManagerRule.create<CodeWhispererRuntimeClient>().stub {
            on { generateCompletionsPaginator(any<GenerateCompletionsRequest>()) } doReturn generateCompletionsPaginatorResponse
            on { createUploadUrl(any<CreateUploadUrlRequest>()) } doReturn createUploadUrlResponse
            on { startCodeAnalysis(any<StartCodeAnalysisRequest>()) } doReturn startCodeAnalysisResponse
            on { getCodeAnalysis(any<GetCodeAnalysisRequest>()) } doReturn getCodeAnalysisResponse
            on { listCodeAnalysisFindings(any<ListCodeAnalysisFindingsRequest>()) } doReturn listCodeAnalysisFindingsResponse
        }

        val mockConnection = mock<BearerSsoConnection>()
        whenever(mockConnection.getConnectionSettings()) doReturn mock<TokenConnectionSettings>()

        connectionManager = mock {
            on {
                activeConnectionForFeature(any())
            } doReturn authManagerRule.createConnection(ManagedSsoProfile("us-east-1", aString(), emptyList())) as AwsBearerTokenConnection
        }
        projectRule.project.replaceService(ToolkitConnectionManager::class.java, connectionManager, disposableRule.disposable)
    }

    @Test
    fun `Sono region is us-east-1`() {
        assertThat("us-east-1").isEqualTo(SONO_REGION)
    }

    @Test
    fun `generateCompletionsPaginator - bearer`() {
        val request = pythonRequest
        bearerClient.stub { client ->
            on { client.generateCompletions(any<GenerateCompletionsRequest>()) } doReturnConsecutively listOf(
                pythonResponseWithToken("first"),
                pythonResponseWithToken("second"),
                pythonResponseWithToken(""),
            )
        }

        val nextTokens = listOf("first", "second", "")
        val responses = sut.generateCompletionsPaginator(request)

        argumentCaptor<GenerateCompletionsRequest>().apply {
            responses.forEachIndexed { i, response ->
                assertThat(response.nextToken()).isEqualTo(nextTokens[i])
                response.completions().forEachIndexed { j, recommendation ->
                    assertThat(recommendation)
                        .usingRecursiveComparison()
                        .isEqualTo(response.completions()[j])
                }
            }
            verify(bearerClient, times(3)).generateCompletions(capture())
            verifyNoInteractions(sigv4Client)
            assertThat(this.firstValue.nextToken()).isEqualTo("")
            assertThat(this.secondValue.nextToken()).isEqualTo("first")
            assertThat(this.thirdValue.nextToken()).isEqualTo("second")
        }
    }

    @Test
    fun `createUploadUrl - bearer`() {
        val actual = sut.createUploadUrl(createUploadUrlRequest)

        argumentCaptor<CreateUploadUrlRequest>().apply {
            verify(bearerClient).createUploadUrl(capture())
            verifyNoInteractions(sigv4Client)
            assertThat(actual).isInstanceOf(CreateUploadUrlResponse::class.java)
            assertThat(actual).usingRecursiveComparison()
                .comparingOnlyFields("uploadUrl", "uploadId")
                .isEqualTo(createUploadUrlResponse)
        }
    }

    @Test
    fun `createCodeScan - sigv4`() {
        val actual = sut.createCodeScan(createCodeScanRequest, true)

        argumentCaptor<CreateCodeScanRequest>().apply {
            verify(sigv4Client).createCodeScan(capture())
            verifyNoInteractions(bearerClient)
            assertThat(firstValue).isSameAs(createCodeScanRequest)
            assertThat(actual).isSameAs(createCodeScanResponse)
        }
    }

    @Test
    fun `createCodeScan - bearer`() {
        val actual = sut.createCodeScan(createCodeScanRequest, false)

        argumentCaptor<StartCodeAnalysisRequest>().apply {
            verify(bearerClient).startCodeAnalysis(capture())
            verifyNoInteractions(sigv4Client)
            assertThat(actual).isInstanceOf(CreateCodeScanResponse::class.java)
            assertThat(actual).usingRecursiveComparison()
                .comparingOnlyFields("jobId", "status", "errorMessage")
                .isEqualTo(startCodeAnalysisResponse)
        }
    }

    @Test
    fun `getCodeScan - sigv4`() {
        val actual = sut.getCodeScan(getCodeScanRequest, true)

        argumentCaptor<GetCodeScanRequest>().apply {
            verify(sigv4Client).getCodeScan(capture())
            verifyNoInteractions(bearerClient)
            assertThat(firstValue).isSameAs(getCodeScanRequest)
            assertThat(actual).isSameAs(getCodeScanResponse)
        }
    }

    @Test
    fun `getCodeScan - bearer`() {
        val actual = sut.getCodeScan(getCodeScanRequest, false)

        argumentCaptor<GetCodeAnalysisRequest>().apply {
            verify(bearerClient).getCodeAnalysis(capture())
            verifyNoInteractions(sigv4Client)
            assertThat(actual).isInstanceOf(GetCodeScanResponse::class.java)
            assertThat(actual).usingRecursiveComparison()
                .comparingOnlyFields("status", "errorMessage")
                .isEqualTo(getCodeAnalysisResponse)
        }
    }

    @Test
    fun `listCodeScanFindings - sigv4`() {
        val actual = sut.listCodeScanFindings(listCodeScanFindingsRequest, true)

        argumentCaptor<ListCodeScanFindingsRequest>().apply {
            verify(sigv4Client).listCodeScanFindings(capture())
            verifyNoInteractions(bearerClient)
            assertThat(firstValue).isSameAs(listCodeScanFindingsRequest)
            assertThat(actual).isSameAs(listCodeScanFindingsResponse)
        }
    }

    @Test
    fun `listCodeScanFindings - bearer`() {
        val actual = sut.listCodeScanFindings(listCodeScanFindingsRequest, false)

        argumentCaptor<ListCodeAnalysisFindingsRequest>().apply {
            verify(bearerClient).listCodeAnalysisFindings(capture())
            verifyNoInteractions(sigv4Client)
            assertThat(actual).isInstanceOf(ListCodeScanFindingsResponse::class.java)
            assertThat(actual.codeScanFindings()).isEqualTo(listCodeAnalysisFindingsResponse.codeAnalysisFindings())
            assertThat(actual.nextToken()).isEqualTo(listCodeAnalysisFindingsResponse.nextToken())
        }
    }

    private companion object {
        val createCodeScanRequest = CreateCodeScanRequest.builder()
            .artifacts(mapOf(ArtifactType.SOURCE_CODE to "foo"))
            .clientToken("token")
            .programmingLanguage(
                ProgrammingLanguage.builder()
                    .languageName("python")
                    .build()
            )
            .build()

        val createUploadUrlRequest = CreateUploadUrlRequest.builder()
            .contentMd5("foo")
            .artifactType(software.amazon.awssdk.services.codewhispererruntime.model.ArtifactType.SOURCE_CODE)
            .build()

        val getCodeScanRequest = GetCodeScanRequest.builder()
            .jobId("jobid")
            .build()

        val listCodeScanFindingsRequest = ListCodeScanFindingsRequest.builder()
            .codeScanFindingsSchema(CodeScanFindingsSchema.CODESCAN_FINDINGS_1_0)
            .jobId("listCodeScanFindings - JobId")
            .nextToken("nextToken")
            .build()

        val createUploadUrlResponse: CreateUploadUrlResponse = CreateUploadUrlResponse.builder()
            .uploadUrl("url")
            .uploadId("id")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as CreateUploadUrlResponse

        val startCodeAnalysisResponse = StartCodeAnalysisResponse.builder()
            .jobId("create-code-scan-user")
            .status(CodeAnalysisStatus.COMPLETED)
            .errorMessage("message")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as StartCodeAnalysisResponse

        val getCodeAnalysisResponse = GetCodeAnalysisResponse.builder()
            .status(CodeAnalysisStatus.PENDING)
            .errorMessage("message")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as GetCodeAnalysisResponse

        val listCodeAnalysisFindingsResponse = ListCodeAnalysisFindingsResponse.builder()
            .codeAnalysisFindings("findings")
            .nextToken("nextToken")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as ListCodeAnalysisFindingsResponse

        private val generateCompletionsPaginatorResponse: GenerateCompletionsIterable = mock()

        private val createCodeScanUploadUrlResponse: CreateCodeScanUploadUrlResponse = mock()

        private val createCodeScanResponse: CreateCodeScanResponse = mock()

        private val getCodeScanResponse: GetCodeScanResponse = mock()

        private val listCodeScanFindingsResponse: ListCodeScanFindingsResponse = mock()
    }
}
