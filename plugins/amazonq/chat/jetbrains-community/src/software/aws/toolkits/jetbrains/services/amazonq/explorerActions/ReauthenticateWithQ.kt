// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.explorerActions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import software.aws.toolkits.jetbrains.core.gettingstarted.reauthenticateWithQ
import software.aws.toolkits.resources.message

class ReauthenticateWithQ : AnAction(message("q.reauthenticate")) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        reauthenticateWithQ(project)
    }
}
