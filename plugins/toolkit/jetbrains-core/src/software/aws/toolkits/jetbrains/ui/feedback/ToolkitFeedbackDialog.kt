// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.feedback.sendFeedbackWithExperimentsMetadata
import software.aws.toolkits.resources.message

class ToolkitFeedbackDialog(project: Project) : FeedbackDialog(project) {
    override fun productName() = "AWS Toolkit"
    override fun notificationTitle() = message("aws.notification.title")

    override fun getHelpId() = HelpIds.AWS_TOOLKIT_GETTING_STARTED.id

    override suspend fun sendFeedback() {
        sendFeedbackWithExperimentsMetadata(sentiment, commentText)
    }
}

class ShowFeedbackDialogAction : DumbAwareAction(message("feedback.title", "Toolkit"), message("feedback.description"), AwsIcons.Misc.SMILE_GREY) {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun actionPerformed(e: AnActionEvent) {
        runInEdt {
            ToolkitFeedbackDialog(e.getRequiredData(LangDataKeys.PROJECT)).show()
        }
    }

    override fun update(e: AnActionEvent) {
        super.update(e)
        e.presentation.icon = AwsIcons.Misc.SMILE_GREY
    }
}
