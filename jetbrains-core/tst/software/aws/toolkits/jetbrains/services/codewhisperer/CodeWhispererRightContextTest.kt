// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import kotlin.random.Random

class CodeWhispererRightContextTest : CodeWhispererTestBase() {

    @Test
    fun `test recommendation equal to right context should not show recommendation`() {
        val rightContext = pythonResponse.recommendations()[0].content()
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            val firstRecommendation = states.recommendationContext.details[0]
            assertThat(firstRecommendation.isDiscarded).isEqualTo(true)
        }
    }

    @Test
    fun `test right context resolution will not change reference spans`() {
        val rightContext = pythonResponse.recommendations()[0].content()
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            val firstRecommendation = states.recommendationContext.details[0]
            assertThat(firstRecommendation.isDiscarded).isEqualTo(true)
            val details = states.recommendationContext.details
            details.forEach {
                val span = it.reformatted.references()[0].recommendationContentSpan()
                assertThat(span.start()).isEqualTo(0)
                assertThat(span.end()).isEqualTo(it.recommendation.content().length)
            }
        }
    }

    @Test
    fun `test suffix of recommendation equal to right context should truncate recommendation when remaining is single-line`() {
        val firstRecommendation = pythonResponse.recommendations()[0].content()
        val newLineIndex = firstRecommendation.indexOf('\n')
        val remainingLength = Random.nextInt(1, newLineIndex)
        val remaining = firstRecommendation.substring(0, remainingLength)
        val rightContext = pythonResponse.recommendations()[0].content().substring(remainingLength)
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            assertThat(states.recommendationContext.details[0].reformatted.content()).isEqualTo(remaining)
            popupManagerSpy.popupComponents.acceptButton.doClick()
            assertThat(states.requestContext.editor.document.text).isEqualTo(pythonTestLeftContext + remaining + rightContext)
        }
    }

    @Test
    fun `test suffix of recommendation equal to right context should not truncate recommendation when remaining is multi-line`() {
        val firstRecommendation = pythonResponse.recommendations()[0].content()
        val newLineIndex = firstRecommendation.indexOf('\n')
        val remainingLength = Random.nextInt(newLineIndex, firstRecommendation.length)
        val rightContext = pythonResponse.recommendations()[0].content().substring(remainingLength)
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            assertThat(states.recommendationContext.details[0].recommendation.content()).isEqualTo(firstRecommendation)
        }
    }

    @Test
    fun `test suffix of recommendation equal to prefix of right context should truncate recommendation when remaining is single-line`() {
        val firstRecommendation = pythonResponse.recommendations()[0].content()
        val newLineIndex = firstRecommendation.indexOf('\n')
        val remainingLength = Random.nextInt(1, newLineIndex)
        val remaining = firstRecommendation.substring(0, remainingLength)
        val rightContext = pythonResponse.recommendations()[0].content().substring(remainingLength) + "test"
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            assertThat(states.recommendationContext.details[0].reformatted.content()).isEqualTo(remaining)
            popupManagerSpy.popupComponents.acceptButton.doClick()
            assertThat(states.requestContext.editor.document.text).isEqualTo(pythonTestLeftContext + remaining + rightContext)
        }
    }

    @Test
    fun `test suffix of recommendation equal to prefix of right context should not truncate recommendation when remaining is multi-line`() {
        val firstRecommendation = pythonResponse.recommendations()[0].content()
        val newLineIndex = firstRecommendation.indexOf('\n')
        val remainingLength = Random.nextInt(newLineIndex, firstRecommendation.length)
        val rightContext = pythonResponse.recommendations()[0].content().substring(remainingLength) + "test"
        setFileContext(pythonFileName, pythonTestLeftContext, rightContext)
        withCodeWhispererServiceInvokedAndWait { states ->
            assertThat(states.recommendationContext.details[0].recommendation.content()).isEqualTo(firstRecommendation)
        }
    }
}
