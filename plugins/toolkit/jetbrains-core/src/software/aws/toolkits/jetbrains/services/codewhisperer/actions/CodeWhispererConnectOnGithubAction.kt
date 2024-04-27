// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.actions

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.resources.message
import java.net.URI

class CodeWhispererConnectOnGithubAction :
    AnAction(
        message("codewhisperer.actions.connect_github.title"),
        null,
        AllIcons.Vcs.Vendors.Github
    ),
    DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        BrowserUtil.browse(URI(CodeWhispererConstants.Q_GITHUB_URI))
    }
}
