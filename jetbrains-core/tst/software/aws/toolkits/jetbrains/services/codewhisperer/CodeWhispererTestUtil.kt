// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.gradle.internal.impldep.com.amazonaws.ResponseMetadata.AWS_REQUEST_ID
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhisperer.model.CodeWhispererException
import software.amazon.awssdk.services.codewhisperer.model.FileContext
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsResponse
import software.amazon.awssdk.services.codewhisperer.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhisperer.model.Recommendation
import software.amazon.awssdk.services.codewhisperer.model.RecommendationsWithReferencesPreference
import software.amazon.awssdk.services.codewhisperer.model.Reference
import software.amazon.awssdk.services.codewhisperer.model.Span
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
    val testCodeWhispererException = CodeWhispererException.builder()
        .requestId(testRequestIdForCodeWhispererException)
        .awsErrorDetails(errorDetail)
        .build() as CodeWhispererException

    val pythonRequest: ListRecommendationsRequest = ListRecommendationsRequest.builder()
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

    val pythonResponse: ListRecommendationsResponse = ListRecommendationsResponse.builder()
        .recommendations(
            generateMockRecommendationDetail("(x, y):\n    return x + y"),
            generateMockRecommendationDetail("(a, b):\n    return a + b"),
            generateMockRecommendationDetail("test recommendation 3"),
            generateMockRecommendationDetail("test recommendation 4"),
            generateMockRecommendationDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as ListRecommendationsResponse
    val pythonResponseWithToken: ListRecommendationsResponse = pythonResponse.toBuilder().nextToken(testNextToken).build()
    val javaResponse: ListRecommendationsResponse = ListRecommendationsResponse.builder()
        .recommendations(
            generateMockRecommendationDetail("(x, y) {\n        return x + y\n    }"),
            generateMockRecommendationDetail("(a, b) {\n        return a + b\n    }"),
            generateMockRecommendationDetail("test recommendation 3"),
            generateMockRecommendationDetail("test recommendation 4"),
            generateMockRecommendationDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as ListRecommendationsResponse
    val emptyListResponse: ListRecommendationsResponse = ListRecommendationsResponse.builder()
        .recommendations(listOf())
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as ListRecommendationsResponse
    val listOfEmptyRecommendationResponse: ListRecommendationsResponse = ListRecommendationsResponse.builder()
        .recommendations(
            generateMockRecommendationDetail(""),
            generateMockRecommendationDetail(""),
            generateMockRecommendationDetail(""),
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as ListRecommendationsResponse
    val listOfMixedEmptyAndNonEmptyRecommendationResponse: ListRecommendationsResponse = ListRecommendationsResponse.builder()
        .recommendations(
            generateMockRecommendationDetail(""),
            generateMockRecommendationDetail("test recommendation 3"),
            generateMockRecommendationDetail(""),
            generateMockRecommendationDetail("test recommendation 4"),
            generateMockRecommendationDetail("test recommendation 5")
        )
        .nextToken("")
        .responseMetadata(metadata)
        .sdkHttpResponse(sdkHttpResponse)
        .build() as ListRecommendationsResponse

    const val pythonFileName = "test.py"
    const val javaFileName = "test.java"
    const val cppFileName = "test.cpp"
    const val jsFileName = "test.js"
    const val pythonTestLeftContext = "def addTwoNumbers"
    const val cppTestLeftContext = "int addTwoNumbers"
    const val javaTestContext = "public class Test {\n    public static void main\n}"

    internal fun generateMockRecommendationDetail(content: String): Recommendation {
        val referenceInfo = getReferenceInfo()
        return Recommendation.builder().content(content)
            .references(
                generateMockReferences(referenceInfo.first, referenceInfo.second, 0, content.length)
            )
            .build()
    }

    internal fun getReferenceInfo() = testReferenceInfoPair[Random.nextInt(testReferenceInfoPair.size)]

    internal fun generateMockRecommendationDetail(
        content: String,
        licenseName: String,
        repository: String,
        start: Int,
        end: Int
    ): Recommendation =
        Recommendation.builder()
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
