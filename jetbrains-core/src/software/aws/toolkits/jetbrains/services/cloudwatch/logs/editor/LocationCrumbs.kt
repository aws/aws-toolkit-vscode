// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.ui.DoubleClickListener
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

class LocationCrumbs(project: Project, logGroup: String, logStream: String? = null) {
    // This is made available instead of set because it needs to be on different components depending on the window
    val border: Border = IdeBorderFactory.createBorder(SideBorder.BOTTOM)

    val crumbs = listOfNotNull(
        Crumb.Impl(null, project.activeCredentialProvider().displayName, null, null),
        Crumb.Impl(null, project.activeRegion().displayName, null, null),
        Crumb.Impl(null, logGroup, null, object : AbstractAction(message("lambda.logs.action_label")), DumbAware {
            override fun actionPerformed(e: ActionEvent?) {
                CloudWatchLogWindow.getInstance(project)?.showLogGroup(logGroup)
            }
        }),
        logStream?.let { Crumb.Impl(null, it, null, null) }
    )
}

// A double click listener that fires the first registered action on double click
fun Breadcrumbs.installDoubleClickListener() {
    object : DoubleClickListener() {
        override fun onDoubleClick(event: MouseEvent?): Boolean {
            event ?: return false
            val crumb = getCrumbAt(event.x, event.y) ?: return false
            val action = crumb.contextActions.firstOrNull() ?: return false
            action.actionPerformed(ActionEvent(event, ActionEvent.ACTION_PERFORMED, ""))
            return true
        }
    }.installOn(this)
}
