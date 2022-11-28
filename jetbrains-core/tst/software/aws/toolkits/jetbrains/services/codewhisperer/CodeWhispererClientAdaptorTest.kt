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
import software.amazon.awssdk.services.codewhisperer.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhisperer.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanRequest
import software.amazon.awssdk.services.codewhisperer.model.GetCodeScanResponse
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListCodeScanFindingsResponse
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.amazon.awssdk.services.codewhisperer.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhisperer.paginators.ListRecommendationsIterable
import software.amazon.awssdk.services.codewhispererruntime.CodeWhispererRuntimeClient
import software.amazon.awssdk.services.codewhispererruntime.model.CodeAnalysisStatus
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.CreateArtifactUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateArtifactUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.amazon.awssdk.services.codewhispererruntime.model.Span
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisResponse
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
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
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
        ssoClient = mockClientManagerRule.create<SsoOidcClient>()

        sigv4Client = mockClientManagerRule.create<CodeWhispererClient>().stub {
            on { listRecommendationsPaginator(any<ListRecommendationsRequest>()) } doReturn listRecommendationsPaginatorRespone
            on { createUploadUrl(any<CreateUploadUrlRequest>()) } doReturn createUploadUrlResponse
            on { createCodeScan(any<CreateCodeScanRequest>()) } doReturn createCodeScanResponse
            on { getCodeScan(any<GetCodeScanRequest>()) } doReturn getCodeScanResponse
            on { listCodeScanFindings(any<ListCodeScanFindingsRequest>()) } doReturn listCodeScanFindingsResponse
        }

        bearerClient = mockClientManagerRule.create<CodeWhispererRuntimeClient>().stub {
            on { createArtifactUploadUrl(any<CreateArtifactUploadUrlRequest>()) } doReturn createArtifactUploadUrlResponse
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
    fun `listRecommendationsPaginator - sigv4`() {
        val request = pythonRequest
        val response = pythonResponse
        sigv4Client.stub { client ->
            on { client.listRecommendations(any<ListRecommendationsRequest>()) } doReturnConsecutively listOf(
                response.copy { it.nextToken("second") },
                response.copy { it.nextToken("third") },
                response.copy { it.nextToken(("")) }
            )
        }

        val nextTokens = listOf("second", "third", "")
        val responses = sut.listRecommendationsPaginator(request, true)

        argumentCaptor<ListRecommendationsRequest>().apply {
            responses.forEachIndexed { i, response ->
                assertThat(response.nextToken()).isEqualTo(nextTokens[i])
                response.recommendations().forEachIndexed { j, recommendation ->
                    assertThat(recommendation)
                        .usingRecursiveComparison()
                        .isEqualTo(pythonResponse.recommendations()[j])
                }
            }
            verify(sigv4Client, times(3)).listRecommendations(capture())
            verifyNoInteractions(bearerClient)
            assertThat(this.firstValue.nextToken()).isEqualTo("")
            assertThat(this.secondValue.nextToken()).isEqualTo("second")
            assertThat(this.thirdValue.nextToken()).isEqualTo("third")
        }
    }

    @Test
    fun `listRecommendationsPaginator - bearer`() {
        val request = pythonRequest
        val response = generateCompletionsResponse
        bearerClient.stub { client ->
            on { client.generateCompletions(any<GenerateCompletionsRequest>()) } doReturnConsecutively listOf(
                response.copy { it.nextToken("second") },
                response.copy { it.nextToken("third") },
                response.copy { it.nextToken(("")) }
            )
        }

        val nextTokens = listOf("second", "third", "")
        val responses = sut.listRecommendationsPaginator(request, false)

        argumentCaptor<GenerateCompletionsRequest>().apply {
            responses.forEachIndexed { i, response ->
                assertThat(response.nextToken()).isEqualTo(nextTokens[i])
                response.recommendations().forEachIndexed { j, recommendation ->
                    assertThat(recommendation)
                        .usingRecursiveComparison()
                        .isEqualTo(response.recommendations()[j])
                }
            }
            verify(bearerClient, times(3)).generateCompletions(capture())
            verifyNoInteractions(sigv4Client)
            assertThat(this.firstValue.nextToken()).isEqualTo("")
            assertThat(this.secondValue.nextToken()).isEqualTo("second")
            assertThat(this.thirdValue.nextToken()).isEqualTo("third")
        }
    }

    @Test
    fun `createUploadUrl - sigv4`() {
        val actual = sut.createUploadUrl(createUploadUrlRequest, true)

        argumentCaptor<CreateUploadUrlRequest>().apply {
            verify(sigv4Client).createUploadUrl(capture())
            verifyNoInteractions(bearerClient)
            assertThat(firstValue).isEqualTo(createUploadUrlRequest)
            assertThat(actual).isSameAs(createUploadUrlResponse)
        }
    }

    @Test
    fun `createUploadUrl - bearer`() {
        val actual = sut.createUploadUrl(createUploadUrlRequest, false)

        argumentCaptor<CreateArtifactUploadUrlRequest>().apply {
            verify(bearerClient).createArtifactUploadUrl(capture())
            verifyNoInteractions(sigv4Client)
            assertThat(actual).isInstanceOf(CreateUploadUrlResponse::class.java)
            assertThat(actual).usingRecursiveComparison()
                .comparingOnlyFields("uploadUrl", "uploadId")
                .isEqualTo(createArtifactUploadUrlResponse)
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
        val generateCompletionsResponse = GenerateCompletionsResponse.builder()
            .nextToken("")
            .completions(
                Completion.builder()
                    .content("foo")
                    .references(
                        Reference.builder()
                            .licenseName("123")
                            .url("456")
                            .recommendationContentSpan(
                                Span.builder()
                                    .start(0)
                                    .end(1)
                                    .build()
                            )
                            .build()
                    )
                    .build()
            )
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as GenerateCompletionsResponse

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
            .artifactType(ArtifactType.SOURCE_CODE)
            .build()

        val getCodeScanRequest = GetCodeScanRequest.builder()
            .jobId("jobid")
            .build()

        val listCodeScanFindingsRequest = ListCodeScanFindingsRequest.builder()
            .codeScanFindingsSchema(CodeScanFindingsSchema.CODESCAN_FINDINGS_1_0)
            .jobId("listCodeScanFindings - JobId")
            .nextToken("nextToken")
            .build()

        val createArtifactUploadUrlResponse: CreateArtifactUploadUrlResponse = CreateArtifactUploadUrlResponse.builder()
            .uploadUrl("url")
            .uploadId("id")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as CreateArtifactUploadUrlResponse

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

        private val listRecommendationsPaginatorRespone: ListRecommendationsIterable = mock()

        private val createUploadUrlResponse: CreateUploadUrlResponse = mock()

        private val createCodeScanResponse: CreateCodeScanResponse = mock()

        private val getCodeScanResponse: GetCodeScanResponse = mock()

        private val listCodeScanFindingsResponse: ListCodeScanFindingsResponse = mock()
    }
}
