// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.ui.ComponentWithBrowseButton
import com.intellij.openapi.ui.TextComponentAccessor
import com.intellij.openapi.vfs.VirtualFile
import javax.swing.JComponent

class ProjectFileBrowseListener<T : JComponent> @JvmOverloads constructor(
    project: Project,
    textField: ComponentWithBrowseButton<T>,
    chooserDescriptor: FileChooserDescriptor,
    accessor: TextComponentAccessor<T>,
    private val onChosen: ((VirtualFile) -> Unit)? = null
) : ComponentWithBrowseButton.BrowseFolderActionListener<T>(
    null,
    null,
    textField,
    project,
    chooserDescriptor,
    accessor
) {

    override fun getInitialFile(): VirtualFile? {
        val text = componentText
        if (text.isEmpty()) {
            val file = project?.guessProjectDir()
            if (file != null) {
                return file
            }
        }
        return super.getInitialFile()
    }

    override fun onFileChosen(chosenFile: VirtualFile) {
        onChosen?.invoke(chosenFile) ?: super.onFileChosen(chosenFile)
    }
}
