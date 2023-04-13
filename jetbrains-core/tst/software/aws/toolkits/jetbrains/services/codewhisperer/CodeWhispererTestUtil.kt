// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.gradle.internal.impldep.com.amazonaws.ResponseMetadata.AWS_REQUEST_ID
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.CodeWhispererRuntimeException
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.FileContext
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhispererruntime.model.RecommendationsWithReferencesPreference
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.amazon.awssdk.services.codewhispererruntime.model.Span
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererService
import kotlin.random.Random

object CodeWhispererTestUtil {
    const val testSessionId = "test_codewhisperer_session_id"
    const val testRequestId = "test_aws_request_id"
    const val testRequestIdForCodeWhispererException = "test_request_id_for_codewhispererException"
    const val codeWhispererRecommendationActionId = "CodeWhispererRecommendationAction"
    const val codeWhispererCodeScanActionId = "codewhisperer.toolbar.security.scan"
    const val testValidAccessToken = "test_valid_access_token"
    const val testNextToken = "test_next_token"
    private val testReferenceInfoPair = listOf(
        Pair("MIT", "testRepo1"),
        Pair("Apache-2.0", "testRepo2"),
        Pair("BSD-4-Clause", "testRepo3")
    )
    val metadata: DefaultAwsResponseMetadata = DefaultAwsResponseMetadata.create(
        mapOf(AWS_REQUEST_ID to testRequestId)
    )
    val sdkHttpResponse = SdkHttpResponse.builder().headers(
        mapOf(CodeWhispererService.KET_SESSION_ID to listOf(testSessionId))
    ).build()
    private val errorDetail = AwsErrorDetails.builder()
        .errorCode("123")
        .errorMessage("something went wrong")
        .sdkHttpResponse(sdkHttpResponse)
        .build()
    val testCodeWhispererException = CodeWhispererRuntimeException.builder()
        .requestId(testRequestIdForCodeWhispererException)
        .awsErrorDetails(errorDetail)
        .build() as CodeWhispererRuntimeException

    val pythonRequest: GenerateCompletionsRequest = GenerateCompletionsRequest.builder()
        .fileContext(
            FileContext.builder()
                .filename("test.py")
                .programmingLanguage(
                    ProgrammingLanguage.builder()
                        .languageName("python")
                        .build()
                )
                .build()
        )
        .nextToken("")
        .referenceTrackerConfiguration { it.recommendationsWithReferences(RecommendationsWithReferencesPreference.ALLOW) }
        .maxResults(5)
        .build()

    val pythonResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(
            generateMockCompletionDetail("(x, y):\n    return x + y"),
            generateMockCompletionDetail("(a, b):\n    return a + b"),
            generateMockCompletionDetail("test recommendation 3"),
            generateMockCompletionDetail("test recommendation 4"),
            generateMockCompletionDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse
    val pythonResponseWithNonEmptyToken = pythonResponseWithToken(testNextToken)
    val javaResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(
            generateMockCompletionDetail("(x, y) {\n        return x + y\n    }"),
            generateMockCompletionDetail("(a, b) {\n        return a + b\n    }"),
            generateMockCompletionDetail("test recommendation 3"),
            generateMockCompletionDetail("test recommendation 4"),
            generateMockCompletionDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse
    val emptyListResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(listOf())
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse
    val listOfEmptyRecommendationResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(
            generateMockCompletionDetail(""),
            generateMockCompletionDetail(""),
            generateMockCompletionDetail(""),
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse
    val listOfMixedEmptyAndNonEmptyRecommendationResponse: GenerateCompletionsResponse = GenerateCompletionsResponse.builder()
        .completions(
            generateMockCompletionDetail(""),
            generateMockCompletionDetail("test recommendation 3"),
            generateMockCompletionDetail(""),
            generateMockCompletionDetail("test recommendation 4"),
            generateMockCompletionDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as GenerateCompletionsResponse

    const val pythonFileName = "test.py"
    const val javaFileName = "test.java"
    const val cppFileName = "test.cpp"
    const val jsFileName = "test.js"
    const val pythonTestLeftContext = "def addTwoNumbers"
    const val cppTestLeftContext = "int addTwoNumbers"
    const val javaTestContext = "public class Test {\n    public static void main\n}"

    internal fun pythonResponseWithToken(token: String): GenerateCompletionsResponse =
        pythonResponse.toBuilder().nextToken(token).build()

    internal fun generateMockCompletionDetail(content: String): Completion {
        val referenceInfo = getReferenceInfo()
        return Completion.builder().content(content)
            .references(
                generateMockReferences(referenceInfo.first, referenceInfo.second, 0, content.length)
            )
            .build()
    }

    internal fun getReferenceInfo() = testReferenceInfoPair[Random.nextInt(testReferenceInfoPair.size)]

    internal fun generateMockCompletionDetail(
        content: String,
        licenseName: String,
        repository: String,
        start: Int,
        end: Int
    ): Completion =
        Completion.builder()
            .content(content)
            .references(generateMockReferences(licenseName, repository, start, end))
            .build()

    private fun generateMockReferences(licenseName: String, repository: String, start: Int, end: Int) =
        Reference.builder()
            .licenseName(licenseName)
            .repository(repository)
            .recommendationContentSpan(
                Span.builder()
                    .start(start)
                    .end(end)
                    .build()
            )
            .build()
}
