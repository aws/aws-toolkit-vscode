// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.ui

import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.ui.ComponentWithBrowseButton
import com.intellij.openapi.ui.TextComponentAccessor
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.ComboboxWithBrowseButton
import javax.swing.JComponent
import javax.swing.JTextField

/** Similar to [com.intellij.openapi.ui.TextBrowseFolderListener], but tries to set the initial directory to the assumed project root **/
private class ProjectFileBrowseListener<T : JComponent>(
    project: Project,
    component: ComponentWithBrowseButton<T>,
    fileChooserDescriptor: FileChooserDescriptor,
    textComponentAccessor: TextComponentAccessor<T>,
    private val onChosen: ((VirtualFile) -> String?)? = null
) : ComponentWithBrowseButton.BrowseFolderActionListener<T>(
    /* title */
    null,
    /* description */
    null,
    component,
    project,
    fileChooserDescriptor,
    textComponentAccessor
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
        if (onChosen == null) {
            super.onFileChosen(chosenFile)
        } else {
            myTextComponent?.let { textComponent ->
                val text = onChosen.invoke(chosenFile) ?: return@let
                myAccessor.setText(textComponent, text)
            }
        }
    }
}

/** Customization of [com.intellij.ui.components.installFileCompletionAndBrowseDialog] **/
fun <T : JComponent> installProjectFileRootedCompletionAndBrowseDialog(
    project: Project,
    component: ComponentWithBrowseButton<T>,
    textField: JTextField?,
    fileChooserDescriptor: FileChooserDescriptor,
    textComponentAccessor: TextComponentAccessor<T>,
    onChosen: ((VirtualFile) -> String)? = null
) {
    component.addActionListener(
        ProjectFileBrowseListener(project, component, fileChooserDescriptor, textComponentAccessor, onChosen)
    )

    textField?.let {
        FileChooserFactory.getInstance().installFileCompletion(
            it,
            fileChooserDescriptor,
            true,
            null /* infer disposable from UI context */
        )
    }
}

@JvmOverloads
fun installTextFieldProjectFileBrowseListener(
    project: Project,
    component: ComponentWithBrowseButton<JTextField>,
    fileChooserDescriptor: FileChooserDescriptor,
    onChosen: ((VirtualFile) -> String)? = null
) {
    installProjectFileRootedCompletionAndBrowseDialog(
        project = project,
        component = component,
        textField = component.childComponent,
        fileChooserDescriptor = fileChooserDescriptor,
        textComponentAccessor = TextComponentAccessor.TEXT_FIELD_WHOLE_TEXT,
        onChosen = onChosen
    )
}

/* because [com.intellij.ui.ComboboxWithBrowseButton] is deprecated anyways and can't seem to make java happy */
@Deprecated("ComboboxWithBrowseButton is deprecated")
fun installComboBoxProjectFileBrowseListener(
    project: Project,
    component: ComboboxWithBrowseButton,
    fileChooserDescriptor: FileChooserDescriptor,
    onChosen: ((VirtualFile) -> String)? = null
) {
    installProjectFileRootedCompletionAndBrowseDialog(
        project = project,
        component = component,
        textField = null,
        fileChooserDescriptor = fileChooserDescriptor,
        textComponentAccessor = TextComponentAccessor.STRING_COMBOBOX_WHOLE_TEXT,
        onChosen = onChosen
    )
}
