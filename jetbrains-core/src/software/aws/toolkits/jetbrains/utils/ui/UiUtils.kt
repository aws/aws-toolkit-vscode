// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.ui

import com.intellij.lang.Language
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.EditorTextField
import software.aws.toolkits.jetbrains.utils.formatText
import javax.swing.DefaultComboBoxModel
import javax.swing.JComboBox
import javax.swing.JTextField

fun <T> ComboBox<T>.populateValues(selected: T? = null, block: () -> List<T>) {
    ApplicationManager.getApplication().executeOnPooledThread {
        val values = block()
        ApplicationManager.getApplication().invokeLater({
            val model = this.model as DefaultComboBoxModel<T>
            model.removeAllElements()
            values.forEach { model.addElement(it) }
            this.selectedItem = selected
            this.isEnabled = values.isNotEmpty()
        }, ModalityState.any())
    }
}

fun <T> ComboBox<T>.addAndSelectValue(fetch: () -> T) {
    ApplicationManager.getApplication().executeOnPooledThread {
        val value = fetch()
        ApplicationManager.getApplication().invokeLater({
            val model = this.model as DefaultComboBoxModel<T>
            model.addElement(value)
            model.selectedItem = value
        }, ModalityState.any())
    }
}

fun JTextField?.blankAsNull(): String? = if (this?.text?.isNotBlank() == true) {
    text
} else {
    null
}

@Suppress("UNCHECKED_CAST")
fun <T> JComboBox<T>?.selected(): T? = this?.selectedItem as? T

fun EditorTextField.formatAndSet(content: String, language: Language) {
    CommandProcessor.getInstance().runUndoTransparentAction {
        val formatted = formatText(this.project, language, content)
        runWriteAction {
            document.setText(formatted)
        }
    }
}
