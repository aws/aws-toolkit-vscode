// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DefaultProjectFactory
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.resources.message

class SubmitFeedbackInGateway : DumbAwareAction(message("feedback.title", "Toolkit")) {
    override fun actionPerformed(e: AnActionEvent) {
        runInEdt {
            ToolkitFeedbackDialog(DefaultProjectFactory.getInstance().defaultProject).show()
        }
    }
}
