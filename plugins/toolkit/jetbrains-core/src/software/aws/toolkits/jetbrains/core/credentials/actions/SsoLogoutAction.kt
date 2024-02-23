// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.MessageDialogBuilder
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.ProfileSsoManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.logoutFromSsoConnection
import software.aws.toolkits.jetbrains.core.explorer.refreshDevToolTree
import software.aws.toolkits.jetbrains.core.gettingstarted.deleteSsoConnectionCW
import software.aws.toolkits.resources.message

class SsoLogoutAction(private val value: AwsBearerTokenConnection) : DumbAwareAction(message("credentials.individual_identity.signout")) {
    override fun actionPerformed(e: AnActionEvent) {
        if (value is ProfileSsoManagedBearerSsoConnection) {
            val confirmDeletion = MessageDialogBuilder.okCancel(
                message("gettingstarted.auth.idc.sign.out.confirmation.title"),
                message("gettingstarted.auth.idc.sign.out.confirmation")
            ).yesText(message("general.confirm")).ask(e.project)
            if (confirmDeletion) {
                deleteSsoConnectionCW(value)
            }
        }
        logoutFromSsoConnection(e.project, value)
        e.project?.refreshDevToolTree()
    }
}
