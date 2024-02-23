// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryDefinition
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchinsightsTelemetry
import software.aws.toolkits.telemetry.Result
import java.awt.event.ActionEvent
import javax.swing.Action
import javax.swing.JComponent

class RetrieveSavedQueryDialog(
    private val parentEditor: QueryEditor,
    private val project: Project,
    connectionSettings: ConnectionSettings
) : DialogWrapper(project) {
    private val view = SelectSavedQuery(connectionSettings)

    private val action: OkAction = object : OkAction() {
        override fun doAction(e: ActionEvent?) {
            super.doAction(e)
            if (doValidateAll().isNotEmpty()) return

            val selected = view.resourceSelector.selected() ?: throw IllegalStateException("No query definition was selected")
            populateParentEditor(parentEditor, selected)

            close(OK_EXIT_CODE)
            CloudwatchinsightsTelemetry.retrieveQuery(project, Result.Succeeded)
        }
    }

    init {
        super.init()
        title = message("cloudwatch.logs.select_saved_query_dialog_name")
    }

    override fun doCancelAction() {
        CloudwatchinsightsTelemetry.retrieveQuery(project, Result.Cancelled)
        super.doCancelAction()
    }

    override fun createCenterPanel(): JComponent? = view.getComponent()
    override fun getOKAction(): Action = action

    override fun doValidate(): ValidationInfo? {
        if (view.resourceSelector.selected() == null) {
            return ValidationInfo(message("cloudwatch.logs.no_query_entered"), view.resourceSelector)
        }

        return null
    }

    companion object {
        fun populateParentEditor(editor: QueryEditor, selection: QueryDefinition) {
            if (selection.hasLogGroupNames()) {
                editor.logGroupTable.selectLogGroups(selection.logGroupNames().toSet())
            }
            editor.setQueryLanguage()
            editor.queryBox.text = selection.queryString()
        }
    }
}
