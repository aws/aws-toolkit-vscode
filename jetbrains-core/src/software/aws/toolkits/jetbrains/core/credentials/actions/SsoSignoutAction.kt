// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.logoutFromSsoConnection
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.UiTelemetry

class SsoSignoutAction : DumbAwareAction() {
    override fun update(e: AnActionEvent) {
        val connection = connection(e)

        e.presentation.isEnabledAndVisible = connection != null
        connection?.let {
            if (it.label == message("aws_builder_id.service_name")) {
                e.presentation.text = message("aws_builder_id.sign_out")
            } else if (it.label.startsWith(message("iam_identity_center.name"))) {
                e.presentation.text = message("iam_identity_center.sign_out")
            }
        }
    }

    override fun actionPerformed(e: AnActionEvent) {
        val connection = connection(e) ?: return

        logoutFromSsoConnection(e.project, connection) {
            UiTelemetry.click(e.project, "devtools_signout")
        }
    }

    private fun connection(e: AnActionEvent): AwsBearerTokenConnection? = e.project?.let {
        ToolkitConnectionManager.getInstance(it).activeConnection() as? AwsBearerTokenConnection
    }
}
