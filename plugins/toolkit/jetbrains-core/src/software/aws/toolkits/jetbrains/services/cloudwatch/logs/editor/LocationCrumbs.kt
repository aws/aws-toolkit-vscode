// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.editor.colors.EditorColors
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.editor.markup.TextAttributes
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.SideBorder
import com.intellij.ui.components.breadcrumbs.Breadcrumbs
import com.intellij.ui.components.breadcrumbs.Crumb
import kotlinx.coroutines.runBlocking
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import javax.swing.AbstractAction
import javax.swing.border.Border

class LocationBreadcrumbs : Breadcrumbs() {
    init {
        onSelect { crumb, event ->
            crumb.contextActions.firstOrNull()?.actionPerformed(ActionEvent(event, ActionEvent.ACTION_PERFORMED, ""))
        }
    }

    override fun getAttributes(crumb: Crumb): TextAttributes? = getKey(crumb)?.let { EditorColorsManager.getInstance().globalScheme.getAttributes(it) }

    private fun getKey(crumb: Crumb): TextAttributesKey? = if (isHovered(crumb) && crumb.contextActions.isNotEmpty()) {
        EditorColors.BREADCRUMBS_HOVERED
    } else {
        EditorColors.BREADCRUMBS_DEFAULT
    }
}

// This is different from LocationBreadcrumbs because createUiComponents in Kotlin does not have access to the constructor arguments
class LocationCrumbs(project: Project, logGroup: String, logStream: String? = null) {
    // This is made available instead of set because it needs to be on different components depending on the window
    val border: Border = IdeBorderFactory.createBorder(SideBorder.BOTTOM)

    val crumbs = listOfNotNull(
        Crumb.Impl(null, project.activeCredentialProvider().displayName, null, listOf()),
        Crumb.Impl(null, project.activeRegion().displayName, null, listOf()),
        Crumb.Impl(
            null,
            logGroup,
            null,
            object : AbstractAction(message("cloudwatch.logs.view_log_streams")), DumbAware {
                override fun actionPerformed(e: ActionEvent?): Unit = runBlocking {
                    CloudWatchLogWindow.getInstance(project).showLogGroup(logGroup)
                }
            }
        ),
        logStream?.let {
            Crumb.Impl(
                null,
                it,
                null,
                object : AbstractAction(message("cloudwatch.logs.view_log_stream")), DumbAware {
                    override fun actionPerformed(e: ActionEvent?) {
                        CloudWatchLogWindow.getInstance(project).showLogStream(logGroup, it)
                    }
                }
            )
        }
    )
}
