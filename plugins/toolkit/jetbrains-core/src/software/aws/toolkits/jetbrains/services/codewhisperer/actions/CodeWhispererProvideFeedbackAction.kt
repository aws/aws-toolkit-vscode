// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.project.DumbAware
import icons.AwsIcons
import software.aws.toolkits.jetbrains.ui.feedback.FeedbackDialog
import software.aws.toolkits.resources.message

class CodeWhispererProvideFeedbackAction :
    AnAction(
        message("codewhisperer.actions.send_feedback.title"),
        null,
        AwsIcons.Misc.SMILE_GREY
    ),
    DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        FeedbackDialog(e.getRequiredData(LangDataKeys.PROJECT), productName = "CodeWhisperer").showAndGet()
    }
}
