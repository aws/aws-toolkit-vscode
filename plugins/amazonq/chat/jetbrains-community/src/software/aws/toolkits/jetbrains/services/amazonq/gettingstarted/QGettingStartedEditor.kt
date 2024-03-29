// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.gettingstarted

import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.components.JBScrollPane
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class QGettingStartedEditor(
    private val project: Project,
    private val file: VirtualFile,
) :
    UserDataHolderBase(), FileEditor {
    override fun dispose() {
    }

    override fun getComponent(): JComponent {
        val panel = QGettingStartedPanel(project)
        Disposer.register(this, panel)

        return JBScrollPane(panel.component)
    }

    override fun getFile(): VirtualFile = file

    override fun getName(): String = file.name

    override fun getPreferredFocusedComponent(): JComponent? = null

    override fun setState(state: FileEditorState) {}

    override fun isModified(): Boolean = false

    override fun isValid(): Boolean = true

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {
    }

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {
    }
}
