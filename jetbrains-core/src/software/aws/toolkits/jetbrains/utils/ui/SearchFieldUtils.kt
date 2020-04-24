// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.utils.ui

import com.intellij.ui.SearchTextField
import java.awt.event.ActionEvent
import java.awt.event.ActionListener
import java.beans.PropertyChangeEvent
import java.beans.PropertyChangeListener

fun SearchTextField.onEmpty(block: () -> Unit) {
    textEditor.addPropertyChangeListener(object : PropertyChangeListener {
        private var lastText = ""
        override fun propertyChange(evt: PropertyChangeEvent?) {
            val searchFieldText = text.trim()
            if (searchFieldText == lastText) {
                return
            }
            lastText = searchFieldText
            if (text.isEmpty()) {
                block()
            }
        }
    })
}

fun SearchTextField.onEnter(block: () -> Unit) {
    textEditor.addActionListener(object : ActionListener {
        private var lastText = ""
        override fun actionPerformed(e: ActionEvent?) {
            val searchFieldText = text.trim()
            if (searchFieldText == lastText) {
                return
            }
            lastText = searchFieldText
            block()
        }
    })
}
