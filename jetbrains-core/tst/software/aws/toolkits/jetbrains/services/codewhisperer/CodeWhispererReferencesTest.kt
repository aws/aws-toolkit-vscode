// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.generateMockCompletionDetail
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.getReferenceInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.metadata
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.sdkHttpResponse

class CodeWhispererReferencesTest : CodeWhispererTestBase() {

    @Test
    fun `test references with invalid content span will remove the references - index out of bound`() {
        testReferencesRangeValidity("test", 0, 5, invalid = true)
    }

    @Test
    fun `test references with invalid content span will remove the references - start greater than end`() {
        testReferencesRangeValidity("test", 2, 1, invalid = true)
    }

    @Test
    fun `test references with valid content span will not remove the references`() {
        testReferencesRangeValidity("test", 0, 4, invalid = false)
    }

    @Test
    fun `test references with valid(empty) content span will not remove the references`() {
        testReferencesRangeValidity("test", 2, 2, invalid = false)
    }

    private fun testReferencesRangeValidity(content: String, start: Int, end: Int, invalid: Boolean) {
        val referenceInfo = getReferenceInfo()
        val invalidReferencesResponse = GenerateCompletionsResponse.builder()
            .completions(
                generateMockCompletionDetail(content, referenceInfo.first, referenceInfo.second, start, end),
            )
            .nextToken("")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as GenerateCompletionsResponse

        mockClient.stub {
            on {
                mockClient.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                invalidReferencesResponse
            }
        }

        withCodeWhispererServiceInvokedAndWait { states ->
            states.recommendationContext.details.forEach {
                assertThat(it.recommendation.references().isEmpty()).isEqualTo(invalid)
            }
            popupManagerSpy.popupComponents.acceptButton.doClick()
        }
    }
}
