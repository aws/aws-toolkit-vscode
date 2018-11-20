// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("UiUtils")

package software.aws.toolkits.jetbrains.utils.ui

import com.intellij.lang.Language
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.ui.ComboBox
import com.intellij.ui.ClickListener
import com.intellij.ui.EditorTextField
import software.aws.toolkits.jetbrains.utils.formatText
import java.awt.event.MouseEvent
import javax.swing.AbstractButton
import javax.swing.DefaultComboBoxModel
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JTextField
import javax.swing.ListModel

/**
 * @param default The default selected item
 * @param updateStatus If enabled, disable the combo box if the item collection is empty or enable it if the item collection
 * is not empty. Otherwise, the status of the combo box is not changed.
 * @param forceSelectDefault If disabled, override the [default] by selecting previously selected item if it
 * is not null, otherwise still falls back to select [default]
 * @param block Lambda function that returns a new set of items for the combo box.
 */
fun <T> ComboBox<T>.populateValues(
    default: T? = null,
    updateStatus: Boolean = true,
    forceSelectDefault: Boolean = true,
    block: () -> Collection<T>
) {
    ApplicationManager.getApplication().executeOnPooledThread {
        val previouslySelected = this.model.selectedItem
        val previousState = this.isEnabled
        this.model.selectedItem = "Loading..."
        this.isEnabled = false
        val values = block()
        ApplicationManager.getApplication().invokeLater({
            val model = this.model as DefaultComboBoxModel<T>
            model.removeAllElements()
            values.forEach { model.addElement(it) }
            this.selectedItem = if (forceSelectDefault || previouslySelected == null) default else previouslySelected
            if (updateStatus) {
                this.isEnabled = values.isNotEmpty()
            } else {
                this.isEnabled = previousState
            }
        }, ModalityState.any())
    }
}

fun <T> ComboBox<T>.addAndSelectValue(updateStatus: Boolean = true, fetch: () -> T) {
    ApplicationManager.getApplication().executeOnPooledThread {
        val value = fetch()
        ApplicationManager.getApplication().invokeLater({
            val model = this.model as DefaultComboBoxModel<T>
            model.addElement(value)
            model.selectedItem = value
            this.isEnabled = updateStatus
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

/**
 * Allows triggering [button] selection based on clicking on receiver component
 */
@JvmOverloads
fun JComponent.addQuickSelect(button: AbstractButton, postAction: Runnable? = null) {
    object : ClickListener() {
        override fun onClick(event: MouseEvent, clickCount: Int): Boolean {
            if (button.isSelected) {
                return false
            }
            button.isSelected = true
            postAction?.run()
            return true
        }
    }.installOn(this)
}

fun <T> ListModel<T>.find(predicate: (T) -> Boolean): T? {
    for (i in 0..(size - 1)) {
        val element = getElementAt(i)
        if (predicate(element)) {
            return element
        }
    }
    return null
}