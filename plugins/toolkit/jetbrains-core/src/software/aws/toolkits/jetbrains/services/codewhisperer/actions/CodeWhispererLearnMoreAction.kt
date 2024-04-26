// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.actions

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODEWHISPERER_LOGIN_LEARN_MORE_URI
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.CODEWHISPERER_SSO_LEARN_MORE_URI
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants.Q_MARKETPLACE_URI
import software.aws.toolkits.resources.message
import java.net.URI

class CodeWhispererLearnMoreAction :
    AnAction(
        message("codewhisperer.actions.view_documentation.title"),
        null,
        AllIcons.Actions.Help
    ),
    DumbAware {

    override fun actionPerformed(e: AnActionEvent) {
        BrowserUtil.browse(URI(Q_MARKETPLACE_URI))
    }
}

class CodeWhispererSsoLearnMoreAction : AnAction(message("aws.settings.learn_more")), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        BrowserUtil.browse(URI(CODEWHISPERER_SSO_LEARN_MORE_URI))
    }
}

class CodeWhispererLoginLearnMoreAction : AnAction(message("aws.settings.learn_more")), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        BrowserUtil.browse(URI(CODEWHISPERER_LOGIN_LEARN_MORE_URI))
    }
}
