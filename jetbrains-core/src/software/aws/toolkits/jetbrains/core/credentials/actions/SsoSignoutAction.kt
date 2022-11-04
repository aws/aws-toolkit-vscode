// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener

class SsoSignoutAction : DumbAwareAction() {
    override fun update(e: AnActionEvent) {
        val connection = connection(e)

        e.presentation.isEnabledAndVisible = connection != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val connection = connection(e) ?: return

        ApplicationManager.getApplication().messageBus.syncPublisher(BearerTokenProviderListener.TOPIC).invalidate(connection.id)
    }

    private fun connection(e: AnActionEvent): AwsBearerTokenConnection? = e.project?.let {
        ToolkitConnectionManager.getInstance(it).activeConnection() as? AwsBearerTokenConnection
    }
}
