// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.stub
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.generateMockRecommendationDetail
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.getReferenceInfo
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.metadata
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.sdkHttpResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext

class CodeWhispererReferencesTest : CodeWhispererTestBase() {

    @Test
    fun `test references with invalid content span will not remove the references from the recommendation`() {
        testReferencesRangeValidity("test", -1, 4, invalid = true, 1)
        testReferencesRangeValidity("test", 0, 5, invalid = true, 2)
        testReferencesRangeValidity("test", 2, 1, invalid = true, 3)
        testReferencesRangeValidity("test", 2, 2, invalid = false, 4)
        testReferencesRangeValidity("test", 0, 4, invalid = false, 5)
        testReferencesRangeValidity("test", 0, 2, invalid = false, 6)
        testReferencesRangeValidity("test", 3, 4, invalid = false, 7)
    }

    private fun testReferencesRangeValidity(content: String, start: Int, end: Int, invalid: Boolean, times: Int) {
        val referenceInfo = getReferenceInfo()
        val invalidReferencesResponse = ListRecommendationsResponse.builder()
            .recommendations(
                generateMockRecommendationDetail(content, referenceInfo.first, referenceInfo.second, start, end),
            )
            .nextToken("")
            .responseMetadata(metadata)
            .sdkHttpResponse(sdkHttpResponse)
            .build() as ListRecommendationsResponse

        mockClient.stub {
            on {
                mockClient.listRecommendations(any<ListRecommendationsRequest>())
            } doAnswer {
                invalidReferencesResponse
            }
        }

        val statesCaptor = argumentCaptor<InvocationContext>()
        withCodeWhispererServiceInvokedAndWait {
            verify(popupManagerSpy, timeout(5000).times(times))
                .render(statesCaptor.capture(), any(), any())
            statesCaptor.lastValue.recommendationContext.details.forEach {
                assertThat(it.recommendation.references().isEmpty()).isEqualTo(invalid)
            }
            runInEdtAndWait {
                popupManagerSpy.popupComponents.acceptButton.doClick()
            }
        }
    }
}
