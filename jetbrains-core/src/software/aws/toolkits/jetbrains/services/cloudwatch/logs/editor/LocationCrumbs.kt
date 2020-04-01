// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.editor.colors.EditorColors
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.ui.ClickListener
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.SideBorder
import com.intellij.ui.components.breadcrumbs.Breadcrumbs
import com.intellij.ui.components.breadcrumbs.Crumb
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import java.awt.event.MouseEvent
import javax.swing.AbstractAction
import javax.swing.border.Border

class LocationBreadcrumbs : Breadcrumbs() {
    // getAttributes is similar to PsiBreadcrumbs.java with a modification to not style if there are no actions
    override fun getAttributes(crumb: Crumb): TextAttributes? = getKey(crumb)?.let { EditorColorsManager.getInstance().globalScheme.getAttributes(it) }

    private fun getKey(crumb: Crumb): TextAttributesKey? = if (crumb.contextActions.isEmpty()) {
        EditorColors.BREADCRUMBS_DEFAULT
    } else if (isHovered(crumb)) {
        EditorColors.BREADCRUMBS_HOVERED
    } else if (isSelected(crumb) && crumb.contextActions.isNotEmpty()) {
        EditorColors.BREADCRUMBS_CURRENT
    } else {
        if (isAfterSelected(crumb)) {
            EditorColors.BREADCRUMBS_INACTIVE
        } else {
            EditorColors.BREADCRUMBS_DEFAULT
        }
    }
}

// This is different from LocationBreadcrumbs becuase createUiComponents in Kotlin does not have access to the constructor arguments
class LocationCrumbs(project: Project, logGroup: String, logStream: String? = null) {
    // This is made available instead of set because it needs to be on different components depending on the window
    val border: Border = IdeBorderFactory.createBorder(SideBorder.BOTTOM)

    val crumbs = listOfNotNull(
        Crumb.Impl(null, project.activeCredentialProvider().displayName, null, listOf()),
        Crumb.Impl(null, project.activeRegion().displayName, null, listOf()),
        Crumb.Impl(null, logGroup, null, object : AbstractAction(message("cloudwatch.logs.view_log_streams")), DumbAware {
            override fun actionPerformed(e: ActionEvent?) {
                CloudWatchLogWindow.getInstance(project)?.showLogGroup(logGroup)
            }
        }),
        logStream?.let {
            Crumb.Impl(null, it, null, object : AbstractAction(message("cloudwatch.logs.view_log_stream")), DumbAware {
                override fun actionPerformed(e: ActionEvent?) {
                    CloudWatchLogWindow.getInstance(project)?.showLogStream(logGroup, it)
                }
            })
        }
    )
}

// A click listener that fires the first registered action when it is clicked on
fun Breadcrumbs.installClickListener() {
    object : ClickListener() {
        override fun onClick(event: MouseEvent, clickCount: Int): Boolean {
            val crumb = getCrumbAt(event.x, event.y) ?: return false
            val action = crumb.contextActions.firstOrNull() ?: return false
            action.actionPerformed(ActionEvent(event, ActionEvent.ACTION_PERFORMED, ""))
            return true
        }
    }.installOn(this)
}
