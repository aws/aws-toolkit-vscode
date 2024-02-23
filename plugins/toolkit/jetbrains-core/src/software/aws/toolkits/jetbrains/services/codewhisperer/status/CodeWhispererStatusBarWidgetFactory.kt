// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.status

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBar
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.impl.status.widget.StatusBarEditorBasedWidgetFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.isCodeWhispererEnabled
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.resources.message

class CodeWhispererStatusBarWidgetFactory : StatusBarEditorBasedWidgetFactory() {
    override fun getId(): String = ID

    override fun getDisplayName(): String = message("codewhisperer.statusbar.display_name")

    override fun isAvailable(project: Project): Boolean =
        !isRunningOnRemoteBackend() && isCodeWhispererEnabled(project)

    override fun createWidget(project: Project): StatusBarWidget = CodeWhispererStatusBarWidget(project)

    override fun disposeWidget(widget: StatusBarWidget) {
        Disposer.dispose(widget)
    }

    override fun canBeEnabledOn(statusBar: StatusBar) = true

    companion object {
        const val ID = "aws.codewhisperer"
    }
}
