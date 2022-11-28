// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import java.net.URI

class CredentialsHelpAction : DumbAwareAction(AllIcons.General.ContextHelp) {
    override fun actionPerformed(e: AnActionEvent) {
        // TODO: update
        runInEdt {
            BrowserUtil.browse(URI(CodeWhispererConstants.CODEWHISPERER_LOGIN_HELP_URI))
        }
    }
}
