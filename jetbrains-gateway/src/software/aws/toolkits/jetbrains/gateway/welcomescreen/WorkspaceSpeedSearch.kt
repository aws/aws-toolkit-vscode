// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway.welcomescreen

import com.intellij.openapi.application.runInEdt
import com.intellij.ui.DocumentAdapter
import com.intellij.ui.SearchTextField
import com.intellij.ui.SpeedSearchBase
import java.awt.Container
import javax.swing.event.DocumentEvent

class WorkspaceSpeedSearch(private val searchTextField: SearchTextField, panel: WorkspaceGroupsPanel) : SpeedSearchBase<WorkspaceGroupsPanel>(panel) {
    private val components by lazy {
        fun collectSpeedSearchProviders(container: Container): List<WorkspaceSpeedSearchProvider> = container.components.flatMap { component ->
            if (component is WorkspaceSpeedSearchProvider) {
                return@flatMap listOf(component).apply { if (component is Container) this + collectSpeedSearchProviders(component) }
            }

            if (component is Container) {
                return@flatMap collectSpeedSearchProviders(component)
            }

            return@flatMap emptyList()
        }

        collectSpeedSearchProviders(component)
    }

    override fun getSearchField() = searchTextField.textEditor

    init {
        installSupplyTo(component)
        searchTextField.addDocumentListener(object : DocumentAdapter() {
            override fun textChanged(p0: DocumentEvent) {
                refreshSelection()
                val element = findElement(searchTextField.text)
                runInEdt {
                    if (element == null) {
                        searchTextField.foreground = ERROR_FOREGROUND_COLOR
                    } else {
                        searchTextField.foreground = FOREGROUND_COLOR
                    }
                }

                selectElement(element, searchTextField.text)
                refreshSelection()
            }
        })
    }

    override fun refreshSelection() {
        runInEdt {
            components.forEach { it.highlight(component) }
        }
    }

    override fun showPopup(searchText: String?) {
        // noop
    }

    override fun isPopupActive(): Boolean =
        // true so that speedsearch is always on
        true

    override fun getElementCount(): Int =
        components.size

    override fun getElementAt(viewIndex: Int): Any =
        components[viewIndex]

    override fun getSelectedIndex(): Int =
        // "selection" is not supported
        -1

    override fun getElementText(element: Any?): String? = (element as? WorkspaceSpeedSearchProvider)?.getElementText()

    override fun selectElement(element: Any?, selectedText: String) {
        // noop
    }
}
