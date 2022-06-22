// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.status

import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.impl.status.widget.StatusBarEditorBasedWidgetFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager
import software.aws.toolkits.resources.message

class CodeWhispererStatusBarWidgetFactory : StatusBarEditorBasedWidgetFactory() {
    override fun getId(): String = ID

    override fun getDisplayName(): String = message("codewhisperer.statusbar.display_name")

    override fun isAvailable(project: Project): Boolean =
        CodeWhispererExplorerActionManager.getInstance().hasAcceptedTermsOfService()

    override fun createWidget(project: Project): StatusBarWidget = CodeWhispererStatusBarWidget(project)

    override fun disposeWidget(widget: StatusBarWidget) {
        Disposer.dispose(widget)
    }

    companion object {
        private const val ID = "aws.codewhisperer"
    }
}
