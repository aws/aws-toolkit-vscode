// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonResponse
import javax.swing.JButton

class CodeWhispererNavigationTest : CodeWhispererTestBase() {

    @Test
    fun `test navigating to previous recommendation should decrement selected index and update label texts`() {
        testNavigation(true)
    }

    @Test
    fun `test navigating to next recommendation should increment selected index and update label texts`() {
        testNavigation(false)
    }

    private fun testNavigation(isReverse: Boolean) {
        withCodeWhispererServiceInvokedAndWait {
            val indexChange = if (isReverse) -1 else 1

            assertThat(popupManagerSpy.sessionContext.selectedIndex).isEqualTo(0)

            val expectedCount = pythonResponse.recommendations().size
            var expectedSelectedIndex: Int
            val navigationButton: JButton
            val oppositeButton: JButton
            if (isReverse) {
                navigationButton = popupManagerSpy.popupComponents.prevButton
                oppositeButton = popupManagerSpy.popupComponents.nextButton
                expectedSelectedIndex = expectedCount - 1
            } else {
                navigationButton = popupManagerSpy.popupComponents.nextButton
                oppositeButton = popupManagerSpy.popupComponents.prevButton
                expectedSelectedIndex = 0
            }
            if (isReverse) {
                repeat(expectedCount - 1) {
                    oppositeButton.doClick()
                }
            }

            assertThat(popupManagerSpy.sessionContext.selectedIndex).isEqualTo(expectedSelectedIndex)
            assertThat(oppositeButton.isEnabled).isEqualTo(false)

            repeat(expectedCount - 1) {
                assertThat(navigationButton.isEnabled).isEqualTo(true)
                navigationButton.doClick()
                assertThat(oppositeButton.isEnabled).isEqualTo(true)
                expectedSelectedIndex = (expectedSelectedIndex + indexChange) % expectedCount
                assertThat(popupManagerSpy.sessionContext.selectedIndex).isEqualTo(expectedSelectedIndex)
                checkRecommendationInfoLabelText(expectedSelectedIndex + 1, expectedCount)
            }
            assertThat(navigationButton.isEnabled).isEqualTo(false)
        }
    }
}
