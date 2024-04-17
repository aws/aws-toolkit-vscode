// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util

import com.intellij.testFramework.RuleChain
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.whenever
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException
import software.amazon.awssdk.services.codewhispererruntime.model.CreateUploadUrlResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ServiceQuotaExceededException
import software.amazon.awssdk.services.codewhispererruntime.model.ThrottlingException
import software.amazon.awssdk.services.codewhispererruntime.model.ValidationException
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.CodeIterationLimitError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.ContentLengthError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevException
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.PlanIterationLimitError
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.GenerateTaskAssistPlanResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.CodeGenerationStreamResult
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference
import software.aws.toolkits.resources.message
import software.amazon.awssdk.services.codewhispererstreaming.model.ThrottlingException as StreamingThrottlingException

class FeatureDevClientUtilTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var featureDevClient: FeatureDevClient

    private val cwExceptionMsg = "CWException"
    private val otherExceptionMsg = "otherException"

    @Before
    override fun setup() {
        featureDevClient = mock()
    }

    @Test
    fun `test createConversation`() {
        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        val actual = createConversation(featureDevClient)
        assertThat(actual).isEqualTo(exampleCreateTaskAssistConversationResponse.conversationId())
    }

    @Test
    fun `test createConversation with error`() {
        whenever(featureDevClient.createTaskAssistConversation()).thenThrow(RuntimeException())
        assertThatThrownBy {
            createConversation(featureDevClient)
        }.isInstanceOf(FeatureDevException::class.java)
    }

    @Test
    fun `test createUploadUrl`() {
        whenever(featureDevClient.createTaskAssistUploadUrl(testConversationId, testChecksumSha, testContentLength)).thenReturn(exampleCreateUploadUrlResponse)

        val actual = createUploadUrl(featureDevClient, testConversationId, testChecksumSha, testContentLength)
        assertThat(actual).isInstanceOf(CreateUploadUrlResponse::class.java)
        assertThat(actual).usingRecursiveComparison().comparingOnlyFields("uploadUrl", "uploadId", "kmsKeyArn")
            .isEqualTo(exampleCreateUploadUrlResponse)
    }

    @Test
    fun `test createUploadUrl with error`() {
        whenever(featureDevClient.createTaskAssistUploadUrl(testConversationId, testChecksumSha, testContentLength)).thenThrow(RuntimeException())
        assertThatThrownBy {
            createUploadUrl(featureDevClient, testConversationId, testChecksumSha, testContentLength)
        }.isInstanceOf(FeatureDevException::class.java)
    }

    @Test
    fun `test createUploadUrl with validation error`() {
        whenever(featureDevClient.createTaskAssistUploadUrl(testConversationId, testChecksumSha, testContentLength)).thenThrow(
            ValidationException.builder()
                .requestId(testRequestId)
                .message("Invalid contentLength")
                .awsErrorDetails(AwsErrorDetails.builder().errorMessage("Invalid contentLength").build())
                .build()
        )

        assertThatThrownBy {
            createUploadUrl(featureDevClient, testConversationId, testChecksumSha, testContentLength)
        }.isInstanceOf(ContentLengthError::class.java).hasMessage(message("amazonqFeatureDev.content_length.error_text"))
    }

    @Test
    fun `test generatePlan`() = runTest {
        whenever(featureDevClient.generateTaskAssistPlan(testConversationId, testUploadId, userMessage)).thenReturn(exampleGenerateTaskAssistPlanResult)

        val actual = generatePlan(featureDevClient, testConversationId, testUploadId, userMessage, 0)
        assertThat(actual).isInstanceOf(GenerateTaskAssistPlanResult::class.java)
        assertThat(actual.approach).isEqualTo("Generated approach for plan")
    }

    @Test(expected = FeatureDevException::class)
    fun `test generatePlan with error`() = runTest {
        whenever(featureDevClient.generateTaskAssistPlan(testConversationId, testUploadId, userMessage)).thenThrow(RuntimeException())

        generatePlan(featureDevClient, testConversationId, testUploadId, userMessage, 0)
    }

    @Test
    fun `test generatePlan with throttling error`() = runTest {
        whenever(featureDevClient.generateTaskAssistPlan(testConversationId, testUploadId, userMessage)).thenThrow(
            StreamingThrottlingException.builder()
                .requestId(testRequestId)
                .message("limit for number of iterations on an implementation plan")
                .awsErrorDetails(AwsErrorDetails.builder().errorMessage("Plan Iteration limit").build())
                .build()
        )
        var caughtException: Throwable? = null
        try {
            generatePlan(featureDevClient, testConversationId, testUploadId, userMessage, 0)
        } catch (e: Throwable) {
            caughtException = e
        }
        assertThat(caughtException is PlanIterationLimitError).isTrue()
        assertThat(caughtException).hasMessage(message("amazonqFeatureDev.approach_gen.iteration_limit.error_text"))
    }

    @Test
    fun `test getTaskAssistCodeGeneration success`() {
        whenever(featureDevClient.getTaskAssistCodeGeneration(testConversationId, testCodeGenerationId)).thenReturn(exampleGetTaskAssistConversationResponse)

        val actual = getTaskAssistCodeGeneration(featureDevClient, testConversationId, testCodeGenerationId)

        assertThat(actual).isEqualTo(exampleGetTaskAssistConversationResponse)
    }

    @Test
    fun `test getTaskAssistCodeGeneration throws a CodeWhispererRuntimeException`() {
        val exampleCWException = CodeWhispererRuntimeException.builder().awsErrorDetails(
            AwsErrorDetails.builder().errorMessage(cwExceptionMsg).build()
        ).build()
        whenever(featureDevClient.getTaskAssistCodeGeneration(testConversationId, testCodeGenerationId)).thenThrow(exampleCWException)

        assertThatThrownBy {
            getTaskAssistCodeGeneration(featureDevClient, testConversationId, testCodeGenerationId)
        }.isExactlyInstanceOf(FeatureDevException::class.java).withFailMessage(cwExceptionMsg)
    }

    @Test
    fun `test getTaskAssistCodeGeneration throws another Exception`() {
        val exampleOtherException = RuntimeException(otherExceptionMsg)
        whenever(featureDevClient.getTaskAssistCodeGeneration(testConversationId, testCodeGenerationId)).thenThrow(exampleOtherException)

        assertThatThrownBy {
            getTaskAssistCodeGeneration(featureDevClient, testConversationId, testCodeGenerationId)
        }.isExactlyInstanceOf(FeatureDevException::class.java).withFailMessage(otherExceptionMsg)
    }

    @Test
    fun `test startTaskAssistConversation success`() {
        whenever(
            featureDevClient.startTaskAssistCodeGeneration(testConversationId, testUploadId, userMessage)
        ).thenReturn(exampleStartTaskAssistConversationResponse)

        val actual = startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage)

        assertThat(actual).isEqualTo(exampleStartTaskAssistConversationResponse)
    }

    @Test
    fun `test startTaskAssistConversation throws ThrottlingException`() {
        val exampleCWException = ThrottlingException.builder().awsErrorDetails(
            AwsErrorDetails.builder().errorMessage("limit for number of iterations on a code generation").build()
        ).build()
        whenever(featureDevClient.startTaskAssistCodeGeneration(testConversationId, testUploadId, userMessage)).thenThrow(exampleCWException)

        assertThatThrownBy {
            startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage)
        }.isExactlyInstanceOf(CodeIterationLimitError::class.java).withFailMessage(
            message("amazonqFeatureDev.code_generation.iteration_limit.error_text")
        )
    }

    @Test
    fun `test startTaskAssistConversation throws ServiceQuotaExceededException`() {
        val exampleCWException = ServiceQuotaExceededException.builder().awsErrorDetails(
            AwsErrorDetails.builder().errorMessage("service quota exceeded").build()
        ).build()
        whenever(featureDevClient.startTaskAssistCodeGeneration(testConversationId, testUploadId, userMessage)).thenThrow(exampleCWException)

        assertThatThrownBy {
            startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage)
        }.isExactlyInstanceOf(CodeIterationLimitError::class.java).withFailMessage(
            message("amazonqFeatureDev.code_generation.iteration_limit.error_text")
        )
    }

    @Test
    fun `test startTaskAssistConversation throws another CodeWhispererRuntimeException`() {
        val exampleCWException = CodeWhispererRuntimeException.builder().awsErrorDetails(
            AwsErrorDetails.builder().errorMessage(cwExceptionMsg).build()
        ).build()
        whenever(featureDevClient.startTaskAssistCodeGeneration(testConversationId, testUploadId, userMessage)).thenThrow(exampleCWException)

        assertThatThrownBy {
            startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage)
        }.isExactlyInstanceOf(FeatureDevException::class.java).withFailMessage(cwExceptionMsg)
    }

    @Test
    fun `test startTaskAssistConversation throws any other exception`() {
        val exampleOtherException = RuntimeException(otherExceptionMsg)
        whenever(featureDevClient.startTaskAssistCodeGeneration(testConversationId, testUploadId, userMessage)).thenThrow(exampleOtherException)

        assertThatThrownBy {
            startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage)
        }.isExactlyInstanceOf(FeatureDevException::class.java).withFailMessage(otherExceptionMsg)
    }

    @Test
    fun `test exportTaskAssistArchiveResult throws CodeWhispererStreamingException`() {
        val exampleCWException = CodeWhispererRuntimeException.builder().awsErrorDetails(
            AwsErrorDetails.builder().errorMessage(cwExceptionMsg).build()
        ).build()

        assertThatThrownBy {
            runTest {
                whenever(featureDevClient.exportTaskAssistResultArchive(testConversationId)).thenThrow(exampleCWException)
                exportTaskAssistArchiveResult(featureDevClient, testConversationId)
            }
        }.isExactlyInstanceOf(FeatureDevException::class.java).withFailMessage(cwExceptionMsg)
    }

    @Test
    fun `test exportTaskAssistArchiveResult throws other exception`() {
        val exampleOtherException = RuntimeException(otherExceptionMsg)

        assertThatThrownBy {
            runTest {
                whenever(featureDevClient.exportTaskAssistResultArchive(testConversationId)).thenThrow(exampleOtherException)
                exportTaskAssistArchiveResult(featureDevClient, testConversationId)
            }
        }.isExactlyInstanceOf(FeatureDevException::class.java).withFailMessage(otherExceptionMsg)
    }

    @Test
    fun `test exportTaskAssistArchiveResult throws an exportParseError`() {
        assertThatThrownBy {
            runTest {
                whenever(featureDevClient.exportTaskAssistResultArchive(testConversationId)).thenReturn(mutableListOf(byteArrayOf(0, 1, 2)))
                exportTaskAssistArchiveResult(featureDevClient, testConversationId)
            }
        }.isExactlyInstanceOf(FeatureDevException::class.java)
    }

    @Test
    fun `test exportTaskAssistArchiveResult returns correct parsed result`() =
        runTest {
            val codeGenerationJson = "{\"code_generation_result\":{\"new_file_contents\":{\"test.ts\":\"contents\"},\"deleted_files\":[],\"references\":[]}}"
            whenever(featureDevClient.exportTaskAssistResultArchive(testConversationId)).thenReturn(mutableListOf(codeGenerationJson.toByteArray()))

            val actual = exportTaskAssistArchiveResult(featureDevClient, testConversationId)
            assertThat(actual).isInstanceOf(CodeGenerationStreamResult::class.java)
            assertThat(actual.new_file_contents).isEqualTo(mapOf(Pair("test.ts", "contents")))
            assertThat(actual.deleted_files).isEqualTo(emptyList<String>())
            assertThat(actual.references).isEqualTo(emptyList<CodeReference>())
        }
}
