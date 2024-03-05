// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.sono

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProvider

class SonoLogoutAction : DumbAwareAction() {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = provider(e)?.supportsLogout() ?: false
    }

    override fun actionPerformed(e: AnActionEvent) {
        CodeCatalystCredentialManager.getInstance(e.project).closeConnection()
    }

    private fun provider(e: AnActionEvent): BearerTokenProvider? {
        val scm = CodeCatalystCredentialManager.getInstance(e.project)
        val connection = scm.connection() ?: return null
        return scm.provider(connection)
    }
}
