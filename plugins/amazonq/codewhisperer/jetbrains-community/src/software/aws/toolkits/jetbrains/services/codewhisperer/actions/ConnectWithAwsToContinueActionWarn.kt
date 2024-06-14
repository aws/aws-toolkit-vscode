// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.core.gettingstarted.requestCredentialsForCodeWhisperer
import software.aws.toolkits.resources.message

/**
 * Action prompting users to switch to SSO based credential, will nullify accountless credential (delete)
 */
class ConnectWithAwsToContinueActionWarn : DumbAwareAction(message("codewhisperer.notification.accountless.warn.action.connect")) {
    override fun actionPerformed(e: AnActionEvent) {
        e.project?.let {
            runInEdt {
                requestCredentialsForCodeWhisperer(it)
            }
        }
    }
}
class ConnectWithAwsToContinueActionError : DumbAwareAction(message("codewhisperer.notification.accountless.error.action.connect")) {
    override fun actionPerformed(e: AnActionEvent) {
        e.project?.let {
            runInEdt {
                requestCredentialsForCodeWhisperer(it)
            }
        }
    }
}
