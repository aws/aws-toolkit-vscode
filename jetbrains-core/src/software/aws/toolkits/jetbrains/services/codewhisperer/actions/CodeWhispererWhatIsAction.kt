// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.resources.message

class CodeWhispererWhatIsAction :
    AnAction(
        message("codewhisperer.explorer.what_is"),
        null,
        AllIcons.Actions.Help
    ),
    DumbAware {
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = CodeWhispererExplorerActionManager.getInstance().hasAcceptedTermsOfService()
    }

    override fun actionPerformed(e: AnActionEvent) {
        CodeWhispererExplorerActionManager.getInstance().showWhatIsCodeWhisperer()
    }
}
