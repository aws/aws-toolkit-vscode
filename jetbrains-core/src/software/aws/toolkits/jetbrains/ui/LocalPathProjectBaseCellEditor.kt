// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.util.SystemInfo
import com.intellij.openapi.util.text.StringUtil
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.util.ui.LocalPathCellEditor
import java.awt.event.ActionListener
import javax.swing.JTable

/**
 * A custom implementation of [LocalPathCellEditor] that defaults to the [project] basedir
 * if the currently selected value of a cell is null.
 */
class LocalPathProjectBaseCellEditor(private val project: Project) : LocalPathCellEditor(project) {

    override fun createActionListener(table: JTable?) = ActionListener {
        val selected = (cellEditorValue as? String)?.takeIf { StringUtil.isNotEmpty(it) }?.let { LocalFileSystem.getInstance().findFileByPath(it) }

        val initialFile = selected ?: project.guessProjectDir()
        FileChooser.chooseFile(fileChooserDescriptor, project, table, initialFile) { file ->
            var path = file.presentableUrl
            if (SystemInfo.isWindows && path.length == 2 && Character.isLetter(path[0]) && path[1] == ':') {
                path += "\\" // make path absolute
            }
            myComponent.childComponent.text = path
        }
    }
}
