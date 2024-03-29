// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ex.ToolWindowManagerListener
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.services.codemodernizer.auth.isCodeTransformAvailable
import software.aws.toolkits.jetbrains.services.codemodernizer.panels.managers.CodeModernizerBottomWindowPanelManager
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererActivationChangedListener

class CodeTransformProjectStartupSettingListener(private val project: Project) :
    CodeWhispererActivationChangedListener,
    ToolWindowManagerListener,
    ToolkitConnectionManagerListener,
    BearerTokenProviderListener {

    override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
        runInEdt {
            val isAvailable = isCodeTransformAvailable(project)
            CodeModernizerBottomWindowPanelManager.getInstance(project).toolWindow?.isAvailable = isAvailable
            CodeModernizerManager.getInstance(project).handleCredentialsChanged()
            if (isAvailable) {
                CodeModernizerManager.getInstance(project).tryResumeJob()
            }
        }
    }
}
