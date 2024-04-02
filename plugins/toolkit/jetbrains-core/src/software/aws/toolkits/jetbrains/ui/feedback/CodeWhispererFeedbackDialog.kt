// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.feedback.sendFeedbackWithExperimentsMetadata
import software.aws.toolkits.resources.message

class CodeWhispererFeedbackDialog(project: Project) : FeedbackDialog(project) {
    override fun productName() = message("aws.notification.title.codewhisperer")
    override fun notificationTitle() = productName()
    override fun getHelpId() = HelpIds.CODEWHISPERER_TOKEN.id

    override suspend fun sendFeedback() {
        sendFeedbackWithExperimentsMetadata(
            sentiment,
            "CodeWhisperer onboarding: $commentText",
            mapOf(FEEDBACK_SOURCE to "CodeWhisperer onboarding")
        )
    }
}
