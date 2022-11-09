// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.icons.AllIcons
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.components.JBList
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.HorizontalAlign
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.JLabel

data class PanelAction(
    val text: String,
    val icon: Icon?,
    val action: (() -> Unit)? = null
)

internal fun buildIamHelpPanel(connection: ToolkitConnection?): JComponent {
    if (connection == null) {
        return panel {
            row {
                label(message("settings.credentials.get_started"))
            }
        }
    }

    val (ctaText, ctaIcon) = if (CredentialManager.getInstance().getCredentialIdentifiers().isEmpty()) {
        message("settings.credentials.iam.add") to AllIcons.General.Add
    } else {
        message("settings.credentials.iam.select") to AllIcons.Actions.Refresh
    }

    val list = JBList(
        PanelAction(message("settings.credentials.iam.none_selected"), AllIcons.General.Error),
        PanelAction(ctaText, ctaIcon)
    )

    list.installCellRenderer {
        JLabel(it.text).apply {
            icon = it.icon
        }
    }

    object : DoubleClickListener() {
        override fun onDoubleClick(event: MouseEvent): Boolean {
            val action = list.selectedValue?.action ?: return false

            action()

            return true
        }
    }.installOn(list)

    return panel {
        row {
            cell(list)
                .horizontalAlign(HorizontalAlign.FILL)
        }
    }
}
