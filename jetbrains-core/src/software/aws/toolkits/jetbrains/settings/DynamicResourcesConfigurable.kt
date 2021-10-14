// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.ProjectManager
import com.intellij.ui.CheckBoxList
import com.intellij.ui.FilterComponent
import com.intellij.ui.ListSpeedSearch
import com.intellij.ui.layout.panel
import software.aws.toolkits.core.utils.replace
import software.aws.toolkits.jetbrains.core.explorer.ExplorerToolWindow
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSupportedTypes
import software.aws.toolkits.jetbrains.services.dynamic.explorer.OtherResourcesNode
import software.aws.toolkits.resources.message
import javax.swing.ListSelectionModel

class DynamicResourcesConfigurable : BoundConfigurable(message("aws.settings.dynamic_resources_configurable.title")) {

    private val checklist = CheckBoxList<String>()
    private val allResources = mutableSetOf<String>()
    private val selected = mutableSetOf<String>()
    private val filter = object : FilterComponent("filter", 5) {
        override fun filter() {
            updateCheckboxList()
        }
    }

    init {
        checklist.selectionMode = ListSelectionModel.MULTIPLE_INTERVAL_SELECTION
        checklist.setCheckBoxListListener(::checkboxStateHandler)

        ListSpeedSearch(checklist) {
            it.text.substringAfter("::")
        }
    }

    override fun getPreferredFocusedComponent() = checklist

    override fun createPanel() = panel {
        selected.replace(DynamicResourcesSettings.getInstance().selected)
        ApplicationManager.getApplication().executeOnPooledThread {
            allResources.addAll(DynamicResourceSupportedTypes.getInstance().getSupportedTypes())
            runInEdt(ModalityState.any()) {
                updateCheckboxList()
            }
        }

        row { filter(growX) }
        row {
            scrollPane(checklist)
                .constraints(growX, pushX)
                .onIsModified { selected != DynamicResourcesSettings.getInstance().selected }
                .onApply {
                    DynamicResourcesSettings.getInstance().selected = selected
                    refreshAwsExplorer()
                }
                .onReset {
                    selected.replace(DynamicResourcesSettings.getInstance().selected)
                    updateCheckboxList()
                }
            right {
                cell(isVerticalFlow = true) {
                    val sizeGroup = "buttons"
                    button(message("aws.settings.dynamic_resources_configurable.select_all")) {
                        checklist.toggleAll(true)
                    }.sizeGroup(sizeGroup)

                    button(message("aws.settings.dynamic_resources_configurable.clear_all")) {
                        checklist.toggleAll(false)
                    }.sizeGroup(sizeGroup)
                }
            }
        }
    }

    private fun CheckBoxList<*>.toggleAll(state: Boolean) {
        (0 until model.size).forEach { idx ->
            checkboxStateHandler(idx, state)
        }
        updateCheckboxList()
    }

    private fun updateCheckboxList() {
        checklist.clear()
        allResources.filter { it.contains(filter.filter, ignoreCase = true) }.sorted().forEach { checklist.addItem(it, it, it in selected) }
    }

    private fun checkboxStateHandler(idx: Int, state: Boolean) {
        checklist.getItemAt(idx)?.let { value ->
            if (state) {
                selected.add(value)
            } else {
                selected.remove(value)
            }
        }
    }

    private fun refreshAwsExplorer() {
        ProjectManager.getInstance().openProjects.forEach { project ->
            if (!project.isDisposed) {
                val toolWindow = ExplorerToolWindow.getInstance(project)
                toolWindow.findNode(OtherResourcesNode::class).then { node ->
                    node.let {
                        toolWindow.invalidateTree(it)
                    }
                }
            }
        }
    }
}
