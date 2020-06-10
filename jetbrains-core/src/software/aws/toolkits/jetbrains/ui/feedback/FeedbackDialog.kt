// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.ValidationInfo
import icons.AwsIcons
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.annotations.TestOnly
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.FeedbackTelemetry
import software.aws.toolkits.telemetry.Result

class FeedbackDialog(private val project: Project) : DialogWrapper(project), CoroutineScope by ApplicationThreadPoolScope("FeedbackDialog") {
    val panel = SubmitFeedbackPanel()

    init {
        title = feedbackTitle
        setOKButtonText(message("feedback.submit_button"))
        init()
    }

    override fun doOKAction() {
        if (okAction.isEnabled) {
            setOKButtonText(message("feedback.submitting"))
            isOKActionEnabled = false
            var result = Result.Succeeded

            val sentiment = panel.sentiment ?: throw IllegalStateException("sentiment was null after validation")
            val comment = panel.comment ?: throw IllegalStateException("comment was null after validation")
            launch {
                val edtContext = getCoroutineUiContext(ModalityState.stateForComponent(panel.panel))
                try {
                    TelemetryService.getInstance().sendFeedback(sentiment, comment)
                    withContext(edtContext) {
                        close(OK_EXIT_CODE)
                    }
                    notifyInfo(message("aws.notification.title"), message("feedback.submit_success"), project)
                } catch (e: Exception) {
                    withContext(edtContext) {
                        Messages.showMessageDialog(panel.panel, message("feedback.submit_failed", e), message("feedback.submit_failed_title"), null)
                        setOKButtonText(message("feedback.submit_button"))
                        isOKActionEnabled = true
                    }
                    result = Result.Failed
                } finally {
                    FeedbackTelemetry.result(project, result = result)
                }
            }
        }
    }

    override fun doCancelAction() {
        super.doCancelAction()
        // kill any remaining coroutines
        coroutineContext.cancel()
        FeedbackTelemetry.result(project, result = Result.Cancelled)
    }

    public override fun doValidate(): ValidationInfo? {
        panel.sentiment ?: return ValidationInfo(message("feedback.validation.no_sentiment"))
        val comment = panel.comment

        return when {
            comment.isNullOrEmpty() -> ValidationInfo(message("feedback.validation.empty_comment"))
            comment.length >= SubmitFeedbackPanel.MAX_LENGTH -> ValidationInfo(message("feedback.validation.comment_too_long"))
            else -> null
        }
    }

    override fun createCenterPanel() = panel.panel

    @TestOnly
    internal fun getViewForTesting(): SubmitFeedbackPanel = panel

    companion object {
        private val feedbackTitle = message("feedback.title")

        fun getAction(project: Project) =
            object : DumbAwareAction(feedbackTitle, message("feedback.description"), AwsIcons.Misc.SMILE_GREY) {
                override fun actionPerformed(e: AnActionEvent) {
                    FeedbackDialog(project).showAndGet()
                }
            }
    }
}
