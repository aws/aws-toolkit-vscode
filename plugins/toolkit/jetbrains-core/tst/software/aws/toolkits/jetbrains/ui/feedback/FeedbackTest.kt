// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.ui.DialogPanel
import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment

class FeedbackTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private lateinit var sut: FeedbackDialog
    private lateinit var sutPanel: DialogPanel

    @Test
    fun `Initial dialog with sentiment positive and no comment is valid`() {
        runInEdt {
            sut = FeedbackDialog(projectRule.project)
            sutPanel = sut.getFeedbackDialog()
            val validationErrors = sutPanel.validationsOnApply.flatMap { it.value }.filter { it.validate() != null }
            assertThat(validationErrors).isEmpty()
        }
    }

    @Test
    fun `Dialog with negative sentiment and comment is valid`() {
        runInEdt {
            sut = FeedbackDialog(projectRule.project, Sentiment.NEGATIVE, "test")
            sutPanel = sut.getFeedbackDialog()
            val validationErrors = sutPanel.validationsOnApply.flatMap { it.value }.filter { it.validate() != null }
            assertThat(validationErrors).isEmpty()
        }
    }
}
