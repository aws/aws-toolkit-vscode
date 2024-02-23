// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor.actions

import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ComputableActionGroup
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.dynamodb.editor.DynamoDbTableEditor

class ConfigureMaxResultsAction : ComputableActionGroup.Simple(/* popup */ true) {
    override fun computeChildren(manager: ActionManager): Array<AnAction> = DynamoDbTableEditor.MAX_RESULTS_OPTIONS
        .map { (ChangeMaxResults(it)) }.toTypedArray()

    private class ChangeMaxResults(private val choice: Int) : ToggleAction(choice.toString()), DumbAware {
        override fun isSelected(e: AnActionEvent): Boolean = getEditorState(e.dataContext)?.maxResults == choice

        override fun setSelected(e: AnActionEvent, state: Boolean) {
            if (state) {
                getEditorState(e.dataContext)?.maxResults = choice
            }
        }

        private fun getEditorState(dataContext: DataContext): DynamoDbTableEditor.EditorState? {
            val dynamoTableEditor = dataContext.getData(PlatformDataKeys.FILE_EDITOR) as? DynamoDbTableEditor
            return dynamoTableEditor?.editorState
        }
    }
}
