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
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import kotlin.random.Random

class CodeWhispererRightContextTest : CodeWhispererTestBase() {

    @Test
    fun `test recommendation equal to right context should not show recommendation`() {
        val rightContext = pythonResponse.completions()[0].content()
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            val firstRecommendation = states.recommendationContext.details[0]
            assertThat(firstRecommendation.isDiscarded).isEqualTo(true)
        }
    }

    @Test
    fun `test right context resolution will remove reference span if reference is the same as right context`() {
        val rightContext = pythonResponse.completions()[0].content()
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            val firstRecommendation = states.recommendationContext.details[0]
            assertThat(firstRecommendation.isDiscarded).isEqualTo(true)
            val details = states.recommendationContext.details
            details.forEach {
                assertThat(it.reformatted.references().isEmpty())
            }
        }
    }

    @Test
    fun `test right context resolution will update range of reference if reference overlaps with right context`() {
        val firstRecommendationContent = pythonResponse.completions()[0].content()
        val lastNewLineIndex = firstRecommendationContent.lastIndexOf('\n')
        val rightContext = firstRecommendationContent.substring(lastNewLineIndex)
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            val firstRecommendation = states.recommendationContext.details[0]
            assertThat(firstRecommendation.isDiscarded).isEqualTo(false)
            val firstDetail = states.recommendationContext.details[0]
            val span = firstDetail.reformatted.references()[0].recommendationContentSpan()
            assertThat(span.start()).isEqualTo(0)
            assertThat(span.end()).isEqualTo(lastNewLineIndex)
        }
    }

    @Test
    fun `test right context resolution will not change reference range if reference does not overlap with right context`() {
        val firstRecommendationContent = pythonResponse.completions()[0].content()
        val lastNewLineIndex = firstRecommendationContent.lastIndexOf('\n')
        val rightContext = firstRecommendationContent.substring(lastNewLineIndex)
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)

        val referenceInfo = CodeWhispererTestUtil.getReferenceInfo()
        val referencesResponse = GenerateCompletionsResponse.builder()
            .completions(
                CodeWhispererTestUtil
                    .generateMockCompletionDetail(firstRecommendationContent, referenceInfo.first, referenceInfo.second, 0, lastNewLineIndex),
            )
            .nextToken("")
            .responseMetadata(CodeWhispererTestUtil.metadata)
            .sdkHttpResponse(CodeWhispererTestUtil.sdkHttpResponse)
            .build() as GenerateCompletionsResponse

        mockClient.stub {
            on {
                mockClient.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                referencesResponse
            }
        }

        withCodeWhispererServiceInvokedAndWait { states ->
            val firstRecommendation = states.recommendationContext.details[0]
            assertThat(firstRecommendation.isDiscarded).isEqualTo(false)
            val firstDetail = states.recommendationContext.details[0]
            val span = firstDetail.reformatted.references()[0].recommendationContentSpan()
            assertThat(span.start()).isEqualTo(0)
            assertThat(span.end()).isEqualTo(lastNewLineIndex)
        }
    }

    @Test
    fun `test suffix of recommendation equal to right context should truncate recommendation when remaining is single-line`() {
        val firstRecommendation = pythonResponse.completions()[0].content()
        val newLineIndex = firstRecommendation.indexOf('\n')
        val remainingLength = Random.nextInt(1, newLineIndex)
        val remaining = firstRecommendation.substring(0, remainingLength)
        val rightContext = pythonResponse.completions()[0].content().substring(remainingLength)
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            assertThat(states.recommendationContext.details[0].reformatted.content()).isEqualTo(remaining)
            popupManagerSpy.popupComponents.acceptButton.doClick()
            assertThat(states.requestContext.editor.document.text).isEqualTo(pythonTestLeftContext + remaining + rightContext)
        }
    }

    @Test
    fun `test suffix of recommendation equal to right context should not truncate recommendation when remaining is multi-line`() {
        val firstRecommendation = pythonResponse.completions()[0].content()
        val newLineIndex = firstRecommendation.indexOf('\n')
        val remainingLength = Random.nextInt(newLineIndex, firstRecommendation.length)
        val rightContext = pythonResponse.completions()[0].content().substring(remainingLength)
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            assertThat(states.recommendationContext.details[0].recommendation.content()).isEqualTo(firstRecommendation)
        }
    }

    @Test
    fun `test suffix of recommendation equal to prefix of right context should truncate recommendation when remaining is single-line`() {
        val firstRecommendation = pythonResponse.completions()[0].content()
        val newLineIndex = firstRecommendation.indexOf('\n')
        val remainingLength = Random.nextInt(1, newLineIndex)
        val remaining = firstRecommendation.substring(0, remainingLength)
        val rightContext = pythonResponse.completions()[0].content().substring(remainingLength) + "test"
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            assertThat(states.recommendationContext.details[0].reformatted.content()).isEqualTo(remaining)
            popupManagerSpy.popupComponents.acceptButton.doClick()
            assertThat(states.requestContext.editor.document.text).isEqualTo(pythonTestLeftContext + remaining + rightContext)
        }
    }

    @Test
    fun `test suffix of recommendation equal to prefix of right context should not truncate recommendation when remaining is multi-line`() {
        val firstRecommendation = pythonResponse.completions()[0].content()
        val newLineIndex = firstRecommendation.indexOf('\n')
        val remainingLength = Random.nextInt(newLineIndex, firstRecommendation.length)
        val rightContext = pythonResponse.completions()[0].content().substring(remainingLength) + "test"
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            assertThat(states.recommendationContext.details[0].recommendation.content()).isEqualTo(firstRecommendation)
        }
    }
}
