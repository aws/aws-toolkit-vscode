// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.openapi.wm.StatusBarWidget
import com.intellij.openapi.wm.WindowManager
import com.intellij.openapi.wm.impl.status.IdeStatusBarImpl
import com.intellij.openapi.wm.impl.status.TextPanel
import com.intellij.ui.awt.RelativePoint
import com.intellij.ui.popup.AbstractPopup
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codewhisperer.status.CodeWhispererStatusBarWidget
import software.aws.toolkits.resources.message
import java.awt.Dimension
import java.awt.Point
import javax.swing.JPanel

class QMigrationNotificationAction : AnAction(message("q.migration.notification.title"), null, AwsIcons.Misc.NEW) {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val statusBar = WindowManager.getInstance().getStatusBar(project)
        val widget = statusBar.getWidget(CodeWhispererStatusBarWidget.ID) ?: return
        val statusBarComponent = statusBar.component as IdeStatusBarImpl? ?: return

        // This is kinda ugly, but it works. We want to display the popup at the status bar component but it's a private
        // field. So we have to search from its parent all the way down that matches Q status bar characteristics.
        val component = statusBarComponent.components.flatMap {
            (it as JPanel).components.filterIsInstance<TextPanel>()
        }.firstOrNull { it.text?.startsWith("Amazon Q") ?: false } ?: return
        val presentation = widget.getPresentation() as StatusBarWidget.MultipleTextValuesPresentation
        val popup = presentation.getPopup() ?: return
        val dimension = getSizeFor(popup)
        val at = Point(0, -dimension.height)
        popup.show(RelativePoint(component, at))
    }

    private fun getSizeFor(popup: JBPopup): Dimension =
        if (popup is AbstractPopup) popup.sizeForPositioning else popup.content.preferredSize
}
