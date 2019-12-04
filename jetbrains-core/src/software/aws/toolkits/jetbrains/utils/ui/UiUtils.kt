// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
@file:JvmName("UiUtils")

package software.aws.toolkits.jetbrains.utils.ui

import com.intellij.lang.Language
import com.intellij.openapi.application.runWriteAction
import com.intellij.openapi.command.CommandProcessor
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.ClickListener
import com.intellij.ui.EditorTextField
import com.intellij.ui.JBColor
import software.aws.toolkits.jetbrains.utils.formatText
import java.awt.Color
import java.awt.event.MouseEvent
import javax.swing.AbstractButton
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JTextField
import javax.swing.ListModel

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
    for (i in 0 until size) {
        val element = getElementAt(i)?.takeIf(predicate)
        if (element != null) {
            return element
        }
    }
    return null
}

// Error messages do not work on a disabled component. May be a JetBrains bug?
fun JComponent.validationInfo(message: String) = when {
    isEnabled -> ValidationInfo(message, this)
    else -> ValidationInfo(message)
}

val BETTER_GREEN = JBColor(Color(104, 197, 116), JBColor.GREEN.darker())
