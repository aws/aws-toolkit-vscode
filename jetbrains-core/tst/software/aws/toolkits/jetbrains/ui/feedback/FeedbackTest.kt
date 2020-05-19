// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.openapi.ui.ValidationInfo
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import org.junit.runners.Suite
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.resources.message

@RunWith(Suite::class)
@Suite.SuiteClasses(FeedbackTest.NonParameterizedTests::class, FeedbackTest.NoCommentSetTest::class)
class FeedbackTest {
    companion object {
        @Rule
        @JvmField
        val projectRule = ProjectRule()
    }

    class NonParameterizedTests {
        @Test
        fun panelInitiallyNegative() {
            val panel = SubmitFeedbackPanel(Sentiment.NEGATIVE)
            assertThat(panel.sentiment).isEqualTo(Sentiment.NEGATIVE)
        }

        @Test
        fun panelInitiallyPositive() {
            val panel = SubmitFeedbackPanel(Sentiment.POSITIVE)
            assertThat(panel.sentiment).isEqualTo(Sentiment.POSITIVE)
        }

        @Test
        fun noSentimentSet() {
            runInEdtAndWait {
                val dialog = FeedbackDialog(projectRule.project)
                val panel = dialog.getViewForTesting()

                assertThat(panel.sentiment).isEqualTo(null)
                assertThat(dialog.doValidate()).isInstanceOfSatisfying(ValidationInfo::class.java) {
                    it.message.contains(message("feedback.validation.no_sentiment"))
                }
            }
        }

        @Test
        fun commentTooLong() {
            runInEdtAndWait {
                val dialog = FeedbackDialog(projectRule.project)
                val panel = dialog.getViewForTesting()

                panel.comment = "string".repeat(2000)
                assertThat(dialog.doValidate()).isInstanceOfSatisfying(ValidationInfo::class.java) {
                    it.message.contains(message("feedback.validation.comment_too_long"))
                }
            }
        }
    }

    @RunWith(Parameterized::class)
    class NoCommentSetTest(private val name: String, private val case: String) {
        companion object {
            @Parameterized.Parameters(name = "{0}")
            @JvmStatic
            fun data() = listOf(
                arrayOf("empty string", ""),
                arrayOf("spaces", "      "),
                arrayOf("new line", "\n")
            )
        }

        @Test
        fun noCommentSet() {
            runInEdtAndWait {
                val dialog = FeedbackDialog(projectRule.project)
                val panel = dialog.getViewForTesting()

                panel.comment = case
                assertThat(dialog.doValidate()).isInstanceOfSatisfying(ValidationInfo::class.java) {
                    it.message.contains(message("feedback.validation.empty_comment"))
                }
            }
        }
    }
}
