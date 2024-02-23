// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.ColorUtil
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.dsl.builder.Cell
import com.intellij.ui.dsl.builder.bind
import com.intellij.ui.dsl.builder.bindText
import com.intellij.ui.dsl.builder.columns
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.rows
import com.intellij.util.IconUtil
import com.intellij.util.ui.UIUtil
import icons.AwsIcons
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.jetbrains.AwsToolkit
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.telemetry.ClientMetadata
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.FeedbackTelemetry
import software.aws.toolkits.telemetry.Result
import java.net.URLEncoder

class FeedbackDialog(
    val project: Project,
    initialSentiment: Sentiment = Sentiment.POSITIVE,
    initialComment: String = "",
    val productName: String = "Toolkit"
) : DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    private var sentiment = initialSentiment
    private val smileIcon = IconUtil.scale(AwsIcons.Misc.SMILE, null, 3f)
    private val sadIcon = IconUtil.scale(AwsIcons.Misc.FROWN, null, 3f)
    private var commentText: String = initialComment
    private lateinit var comment: Cell<JBTextArea>
    private var lengthLimitLabel = JBLabel(message("feedback.comment.textbox.initial.length")).also { it.foreground = UIUtil.getLabelInfoForeground() }

    private val dialogPanel = panel {
        if (isToolkit()) {
            row {
                text(message("feedback.initial.help.text"))
            }
        }
        group(message("feedback.connect.with.github.title")) {
            row {
                icon(AllIcons.Toolwindows.ToolWindowDebugger)
                link(message("feedback.report.issue.link")) {
                    BrowserUtil.browse("${GITHUB_LINK_BASE}${URLEncoder.encode("${comment.component.text}\n\n$toolkitMetadata", Charsets.UTF_8.name())}")
                }
            }
            row {
                icon(AllIcons.Actions.IntentionBulbGrey)

                link(message("feedback.request.feature.link")) {
                    BrowserUtil.browse("${GITHUB_LINK_BASE}${URLEncoder.encode("${comment.component.text}\n\n$toolkitMetadata", Charsets.UTF_8.name())}")
                }
            }
            row {
                icon(AllIcons.Nodes.Tag)
                link(message("feedback.view.source.code.link")) {
                    BrowserUtil.browse(TOOLKIT_REPOSITORY_LINK)
                }
            }
        }

        group(message("feedback.share.feedback.title")) {
            buttonsGroup {
                row {
                    radioButton("", value = Sentiment.POSITIVE).applyToComponent {
                        icon(smileIcon)
                    }

                    radioButton("", value = Sentiment.NEGATIVE).applyToComponent {
                        icon(sadIcon)
                    }
                }
            }.bind({ sentiment }, { sentiment = it })

            if (isAmazonQ()) {
                row(message("feedback.comment.textbox.title.amazonq")) {}
            } else if (isAmazonQFeatureDev()) {
                row(message("feedback.comment.textbox.title.amazonq.feature_dev")) {}
            } else {
                row(message("feedback.comment.textbox.title", productName)) {}
            }
            row { comment(message("feedback.customer.alert.info")) }
            row {
                comment = textArea().rows(6).columns(52).bindText(::commentText).applyToComponent {
                    this.emptyText.text = message("feedback.comment.emptyText")
                    this.lineWrap = true

                    this.document.addUndoableEditListener {
                        onTextAreaUpdate(this.text)
                        commentText = this.text
                    }
                }
            }.comment(commentText)
            row {
                cell(lengthLimitLabel)
            }
        }
    }

    override fun createCenterPanel() = dialogPanel

    override fun doCancelAction() {
        super.doCancelAction()
        // kill any remaining coroutines
        coroutineScope.coroutineContext.cancel()
        FeedbackTelemetry.result(project, result = Result.Cancelled)
    }

    override fun doOKAction() {
        if (okAction.isEnabled) {
            dialogPanel.apply()
            setOKButtonText(message("feedback.submitting"))
            isOKActionEnabled = false
            var result = Result.Succeeded
            coroutineScope.launch {
                val edtContext = getCoroutineUiContext()
                try {
                    if (isCodeWhisperer()) {
                        TelemetryService.getInstance().sendFeedback(
                            sentiment,
                            "CodeWhisperer onboarding: $commentText",
                            mapOf(FEEDBACK_SOURCE to "CodeWhisperer onboarding")
                        )
                    } else if (isAmazonQ()) {
                        val sessionState = CodeModernizerSessionState.getInstance(project)
                        val jobId: String = sessionState.currentJobId?.id ?: "None"
                        TelemetryService.getInstance().sendFeedback(
                            sentiment,
                            "Amazon Q onboarding: $commentText",
                            mapOf(FEEDBACK_SOURCE to "Amazon Q onboarding", "JobId" to jobId)
                        )
                    } else {
                        TelemetryService.getInstance().sendFeedback(sentiment, commentText)
                    }
                    withContext(edtContext) {
                        close(OK_EXIT_CODE)
                    }
                    val notificationTitle = if (isCodeWhisperer()) {
                        message("aws.notification.title.codewhisperer")
                    } else if (isAmazonQ()) {
                        message("aws.notification.title.amazonq")
                    } else if (isAmazonQFeatureDev()) {
                        message("aws.notification.title.amazonq.feature_dev")
                    } else {
                        message("aws.notification.title")
                    }
                    notifyInfo(notificationTitle, message("feedback.submit_success"), project)
                } catch (e: Exception) {
                    withContext(edtContext) {
                        Messages.showMessageDialog(message("feedback.submit_failed", e), message("feedback.submit_failed_title"), null)
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

    override fun doValidate(): ValidationInfo? {
        super.doValidate()
        val comment = commentText

        return when {
            comment.isEmpty() -> null
            comment.length >= MAX_LENGTH -> ValidationInfo(message("feedback.validation.comment_too_long"))
            else -> null
        }
    }

    private fun onTextAreaUpdate(commentText: String) {
        this.commentText = commentText
        val currentLength = this.commentText.length
        val lengthText = message("feedback.limit.label", MAX_LENGTH - currentLength)
        lengthLimitLabel.text = if (currentLength >= MAX_LENGTH) {
            "<html><font color='#${ColorUtil.toHex(UIUtil.getErrorForeground())}'>$lengthText</font></html>"
        } else {
            lengthText
        }
    }

    init {
        super.init()
        if (isAmazonQ()) {
            title = message("feedback.title.amazonq")
        } else if (isAmazonQFeatureDev()) {
            title = message("feedback.title.amazonq.feature_dev")
        } else {
            title = message("feedback.title", productName)
        }
        setOKButtonText(message("feedback.submit_button"))
    }

    override fun getHelpId(): String? = if (isToolkit()) {
        HelpIds.AWS_TOOLKIT_GETTING_STARTED.id
    } else if (isCodeWhisperer()) {
        HelpIds.CODEWHISPERER_TOKEN.id
    } else {
        null
    }

    private fun isCodeWhisperer(): Boolean = (productName == "CodeWhisperer")
    private fun isAmazonQ(): Boolean = (productName == "Amazon Q")
    private fun isToolkit(): Boolean = (productName == "Toolkit")
    private fun isAmazonQFeatureDev(): Boolean = (productName == "Amazon Q FeatureDev")

    @TestOnly
    fun getFeedbackDialog() = dialogPanel

    companion object {
        const val MAX_LENGTH = 2000 // backend restriction
        private const val TOOLKIT_REPOSITORY_LINK = AwsToolkit.GITHUB_URL
        private const val GITHUB_LINK_BASE = "$TOOLKIT_REPOSITORY_LINK/issues/new?body="
        private val toolkitMetadata = ClientMetadata.DEFAULT_METADATA.let {
            """
                ---
                Toolkit: ${it.productName} ${it.productVersion}
                OS: ${it.os} ${it.osVersion}
                IDE: ${it.parentProduct} ${it.parentProductVersion}
            """.trimIndent()
        }
    }
}

class ShowFeedbackDialogAction : DumbAwareAction(message("feedback.title", "Toolkit"), message("feedback.description"), AwsIcons.Misc.SMILE_GREY) {
    override fun actionPerformed(e: AnActionEvent) {
        runInEdt {
            FeedbackDialog(e.getRequiredData(LangDataKeys.PROJECT)).show()
        }
    }

    override fun update(e: AnActionEvent) {
        super.update(e)
        e.presentation.icon = AwsIcons.Misc.SMILE_GREY
    }
}
