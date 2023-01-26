// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererUtil.notifyInfoAccountless
import software.aws.toolkits.resources.message

class DoNotShowAgainActionWarn : AnAction(message("codewhisperer.notification.accountless.warn.dont.show.again")), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        notifyInfoAccountless()
        CodeWhispererExplorerActionManager.getInstance().setDoNotShowAgainWarn(true)
    }
}

class DoNotShowAgainActionError : AnAction(message("codewhisperer.notification.accountless.warn.dont.show.again")), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        notifyInfoAccountless()
        CodeWhispererExplorerActionManager.getInstance().setDoNotShowAgainError(true)
    }
}
