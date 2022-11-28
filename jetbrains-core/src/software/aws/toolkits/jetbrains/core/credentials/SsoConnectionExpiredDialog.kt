// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.ide.BrowserUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper.CANCEL_EXIT_CODE
import com.intellij.openapi.ui.DialogWrapper.OK_EXIT_CODE
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.resources.message
import java.net.URI

class SsoConnectionExpiredDialog(private val project: Project, private val connection: ToolkitConnection?) {
    fun show() {
        connection ?: return
        val res = Messages.showYesNoCancelDialog(
            project,
            message("toolkit.sso_expire.dialog_message"),
            message("toolkit.sso_expire.dialog.title", connection.label),
            message("toolkit.sso_expire.dialog.yes_button"),
            message("toolkit.sso_expire.dialog.no_button"),
            message("toolkit.sso_expire.dialog.cancel_button"),
            Messages.getWarningIcon()
        )

        when (res) {
            OK_EXIT_CODE -> { ToolkitAddConnectionDialog(project, connection).show() }
            CANCEL_EXIT_CODE -> {
                // TODO: update if needed
                BrowserUtil.browse(URI("https://docs.aws.amazon.com/toolkit-for-jetbrains/latest/userguide/codewhisperer.html"))
            }
            else -> {}
        }
    }
}
