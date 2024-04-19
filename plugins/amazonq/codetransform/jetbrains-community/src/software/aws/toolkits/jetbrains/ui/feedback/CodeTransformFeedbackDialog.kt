// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui.feedback

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.codemodernizer.state.CodeModernizerSessionState
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.resources.message

class CodeTransformFeedbackDialog(project: Project) : FeedbackDialog(project) {
    init {
        super.init()
        title = message("feedback.title.amazonq")
    }

    override fun productName() = "Amazon Q"
    override fun feedbackPrompt() = message("feedback.comment.textbox.title.amazonq")
    override fun notificationTitle() = message("aws.notification.title.amazonq")

    override suspend fun sendFeedback() {
        val sessionState = CodeModernizerSessionState.getInstance(project)
        val jobId: String = sessionState.currentJobId?.id ?: "None"
        TelemetryService.getInstance().sendFeedback(
            sentiment,
            "Amazon Q onboarding: $commentText",
            mapOf(FEEDBACK_SOURCE to "Amazon Q onboarding", "JobId" to jobId)
        )
    }
}
