// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.SystemInfo
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argThat
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
import software.amazon.awssdk.services.codewhispererruntime.model.CompletionType
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlRequest
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.Customization
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GetCodeAnalysisResponse
import software.amazon.awssdk.services.codewhispererruntime.model.IdeCategory
import software.amazon.awssdk.services.codewhispererruntime.model.ListAvailableCustomizationsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ListAvailableCustomizationsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ListCodeAnalysisFindingsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ListFeatureEvaluationsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.ListFeatureEvaluationsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.OperatingSystem
import software.amazon.awssdk.services.codewhispererruntime.model.OptOutPreference
import software.amazon.awssdk.services.codewhispererruntime.model.SendTelemetryEventRequest
import software.amazon.awssdk.services.codewhispererruntime.model.SendTelemetryEventResponse
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisRequest
import software.amazon.awssdk.services.codewhispererruntime.model.StartCodeAnalysisResponse
import software.amazon.awssdk.services.codewhispererruntime.model.SuggestionState
import software.amazon.awssdk.services.codewhispererruntime.paginators.GenerateCompletionsIterable
import software.amazon.awssdk.services.codewhispererruntime.paginators.ListAvailableCustomizationsIterable
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.TokenConnectionSettings
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
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
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.model.LatencyContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.TriggerTypeInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.ResponseContext
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.FEATURE_EVALUATION_PRODUCT_NAME
import software.aws.toolkits.jetbrains.settings.AwsSettings
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.telemetry.CodewhispererCompletionType
import software.aws.toolkits.telemetry.CodewhispererSuggestionState
import software.aws.toolkits.telemetry.CodewhispererTriggerType

class CodeWhispererClientAdaptorTest {
    val projectRule = JavaCodeInsightTestFixtureRule()
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
    private var isTelemetryEnabledDefault: Boolean = false

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
            on { sendTelemetryEvent(any<SendTelemetryEventRequest>()) } doReturn sendtelemetryEventResponse
            on { listFeatureEvaluations(any<ListFeatureEvaluationsRequest>()) } doReturn listFeatureEvaluationsResponse
        }

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

    @After
    fun cleanup() {
        Disposer.dispose(sut)
    }

    @Test
    fun `Sono region is us-east-1`() {
        assertThat("us-east-1").isEqualTo(SONO_REGION)
    }

    @Test
    fun `listCustomizations`() {
        val sdkIterable = ListAvailableCustomizationsIterable(bearerClient, ListAvailableCustomizationsRequest.builder().build())
        val mockResponse1 = ListAvailableCustomizationsResponse.builder()
            .customizations(
                listOf(
                    Customization.builder().name("custom-1").arn("arn-1").build(),
                    Customization.builder().name("custom-2").arn("arn-2").build()
                )
            )
            .nextToken("token-1")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as ListAvailableCustomizationsResponse

        val mockResponse2 = ListAvailableCustomizationsResponse.builder()
            .customizations(
                listOf(
                    Customization.builder().name("custom-3").arn("arn-3").build(),
                )
            )
            .nextToken("")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as ListAvailableCustomizationsResponse

        bearerClient.stub { client ->
            on { client.listAvailableCustomizations(any<ListAvailableCustomizationsRequest>()) } doReturnConsecutively listOf(mockResponse1, mockResponse2)
            on { client.listAvailableCustomizationsPaginator(any<ListAvailableCustomizationsRequest>()) } doReturn sdkIterable
        }

        val actual = sut.listAvailableCustomizations()
        assertThat(actual).hasSize(3)
        assertThat(actual).isEqualTo(
            listOf(
                CodeWhispererCustomization(name = "custom-1", arn = "arn-1"),
                CodeWhispererCustomization(name = "custom-2", arn = "arn-2"),
                CodeWhispererCustomization(name = "custom-3", arn = "arn-3")
            )
        )
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
    fun sendUserTriggerDecisionTelemetry() {
        val mockModelConfiguraotr = mock<CodeWhispererModelConfigurator> {
            on { activeCustomization(any()) } doReturn CodeWhispererCustomization("fake-arn", "fake-name")
        }
        ApplicationManager.getApplication().replaceService(CodeWhispererModelConfigurator::class.java, mockModelConfiguraotr, disposableRule.disposable)

        val file = projectRule.fixture.addFileToProject("main.java", "public class Main {}")
        runInEdtAndWait {
            projectRule.fixture.openFileInEditor(file.virtualFile)
        }
        val requestContext = CodeWhispererService.getInstance().getRequestContext(
            TriggerTypeInfo(CodewhispererTriggerType.OnDemand, CodeWhispererAutomatedTriggerType.Unknown()),
            projectRule.fixture.editor,
            projectRule.project,
            file,
            LatencyContext(codewhispererEndToEndStart = 0, codewhispererEndToEndEnd = 20000000)
        )

        sut.sendUserTriggerDecisionTelemetry(
            requestContext,
            ResponseContext("fake-session-id"),
            CodewhispererCompletionType.Line,
            CodewhispererSuggestionState.Accept,
            3,
            1,
            2
        )

        argumentCaptor<SendTelemetryEventRequest>().apply {
            verify(bearerClient).sendTelemetryEvent(capture())
            firstValue.telemetryEvent().userTriggerDecisionEvent().let {
                assertThat(it.completionType()).isEqualTo(CompletionType.LINE)
                assertThat(it.customizationArn()).isEqualTo("fake-arn")
                assertThat(it.suggestionState()).isEqualTo(SuggestionState.ACCEPT)
                assertThat(it.suggestionReferenceCount()).isEqualTo(3)
                assertThat(it.generatedLine()).isEqualTo(1)
                assertThat(it.recommendationLatencyMilliseconds()).isEqualTo(20.0)
                assertThat(it.numberOfRecommendations()).isEqualTo(2)
            }
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

    @Test
    fun `sendTelemetryEvent for userTriggerDecision respects telemetry optin status, for SSO users`() {
        sendTelemetryEventOptOutCheckHelper {
            sut.sendUserTriggerDecisionTelemetry(
                aRequestContext(projectRule.project),
                aResponseContext(),
                aCompletionType(),
                aSuggestionState(),
                0,
                1,
                2
            )
        }
    }

    @Test
    fun `sendTelemetryEvent for codePercentage respects telemetry optin status`() {
        sendTelemetryEventOptOutCheckHelper {
            sut.sendCodePercentageTelemetry(aProgrammingLanguage(), aString(), 0, 1)
        }
    }

    @Test
    fun `sendTelemetryEvent for codeScan respects telemetry optin status`() {
        sendTelemetryEventOptOutCheckHelper {
            sut.sendCodeScanTelemetry(aProgrammingLanguage(), null)
        }
    }

    @Test
    fun `sendTelemetryEvent for userModification respects telemetry optin status`() {
        sendTelemetryEventOptOutCheckHelper {
            sut.sendUserModificationTelemetry(aString(), aString(), aProgrammingLanguage(), aString(), 0.0)
        }
    }

    @Test
    fun `test listFeatureEvaluations sends expected payloads`() {
        sut.listFeatureEvaluations()

        verify(bearerClient).listFeatureEvaluations(
            argThat<ListFeatureEvaluationsRequest> {
                this.userContext().ideCategory() == IdeCategory.JETBRAINS &&
                    this.userContext().operatingSystem() == when {
                        SystemInfo.isWindows -> OperatingSystem.WINDOWS
                        SystemInfo.isMac -> OperatingSystem.MAC
                        else -> OperatingSystem.LINUX
                    } &&
                    this.userContext().product() == FEATURE_EVALUATION_PRODUCT_NAME
            }
        )
    }

    private fun sendTelemetryEventOptOutCheckHelper(mockApiCall: () -> Unit) {
        AwsSettings.getInstance().isTelemetryEnabled = true
        mockApiCall()
        verify(bearerClient).sendTelemetryEvent(
            argThat<SendTelemetryEventRequest> { optOutPreference() == OptOutPreference.OPTIN }
        )

        AwsSettings.getInstance().isTelemetryEnabled = false
        mockApiCall()
        verify(bearerClient).sendTelemetryEvent(
            argThat<SendTelemetryEventRequest> { optOutPreference() == OptOutPreference.OPTOUT }
        )
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

        val sendtelemetryEventResponse = SendTelemetryEventResponse.builder().build()

        val listFeatureEvaluationsResponse = ListFeatureEvaluationsResponse.builder().build()

        private val generateCompletionsPaginatorResponse: GenerateCompletionsIterable = mock()

        private val createCodeScanUploadUrlResponse: CreateCodeScanUploadUrlResponse = mock()

        private val createCodeScanResponse: CreateCodeScanResponse = mock()

        private val getCodeScanResponse: GetCodeScanResponse = mock()

        private val listCodeScanFindingsResponse: ListCodeScanFindingsResponse = mock()
    }
}
