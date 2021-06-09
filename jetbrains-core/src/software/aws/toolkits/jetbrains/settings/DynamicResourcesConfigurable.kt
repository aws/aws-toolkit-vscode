// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.ProjectManager
import com.intellij.ui.CheckBoxList
import com.intellij.ui.FilterComponent
import com.intellij.ui.ListSpeedSearch
import com.intellij.ui.layout.panel
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.explorer.ExplorerToolWindow
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResources
import software.aws.toolkits.jetbrains.services.dynamic.explorer.OtherResourcesNode
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import javax.swing.DefaultListModel
import javax.swing.JCheckBox
import javax.swing.ListSelectionModel

class DynamicResourcesConfigurable : BoundConfigurable(message("aws.settings.dynamic_resources_configurable.title")) {
    private val coroutineScope = ApplicationThreadPoolScope("DynamicResourcesConfigurable")
    private val checklistModel = DefaultListModel<JCheckBox>()
    private val checklist = CheckBoxList<String>(checklistModel)
    private val changeSet = mutableSetOf<Int>()
    private val checkboxListener = { idx: Int ->
        if (idx in changeSet) {
            changeSet.remove(idx)
        } else {
            changeSet.add(idx)
        }
    }

    init {
        checklist.selectionMode = ListSelectionModel.MULTIPLE_INTERVAL_SELECTION
        checklist.setCheckBoxListListener { idx, _ ->
            checkboxListener(idx)
        }

        ListSpeedSearch(checklist) {
            it.text.substringAfter("::")
        }
    }

    override fun getPreferredFocusedComponent() = checklist

    override fun createPanel() = panel {
        val allCheckboxes = mutableListOf<JCheckBox>()
        val selected = DynamicResourcesSettings.getInstance().state.selected
        coroutineScope.launch {
            DynamicResources.SUPPORTED_TYPES.await().forEach {
                checklist.addItem(it, it, it in selected)
            }
            allCheckboxes.addAll(checklist.map { _, checkbox -> checkbox })
        }

        row {
            // filter
            val field = object : FilterComponent("filter", 5) {
                override fun filter() {
                    checklistModel.clear()
                    checklistModel.addAll(allCheckboxes.filter { it.text.contains(filter, ignoreCase = true) })
                }
            }
            field(growX)
        }

        row {
            // scrollpane
            scrollPane(checklist)
                .constraints(growX, pushX)
                .onIsModified {
                    // returns true if there is a change
                    changeSet.size != 0
                }
                .onApply {
                    changeSet.clear()

                    DynamicResourcesSettings.getInstance().state.selected = allCheckboxes.filter { it.isSelected }.map { it.text }.toSet()
                    ProjectManager.getInstance().openProjects.forEach { project ->
                        if (!project.isDisposed) {
                            val toolWindow = ExplorerToolWindow.getInstance(project)
                            toolWindow.findNode(OtherResourcesNode::class).then { node ->
                                node?.let {
                                    toolWindow.invalidateTree(it)
                                }
                            }
                        }
                    }
                }

            // select/clearall
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
        this.forEachIndexed { index, checkbox ->
            checkbox.isSelected = state
            checkboxListener(index)
        }
        this.repaint()
    }

    private companion object {
        fun <T> CheckBoxList<*>.map(fn: (Int, JCheckBox) -> T): List<T> {
            val size = this.model.size - 1

            return (0..size).map {
                fn(it, this.model.getElementAt(it))
            }
        }

        fun CheckBoxList<*>.filter(fn: (JCheckBox) -> Boolean): List<JCheckBox> =
            this.map { _, it ->
                if (fn(it)) {
                    it
                } else {
                    null
                }
            }.filterNotNull()

        fun CheckBoxList<*>.forEachIndexed(fn: (Int, JCheckBox) -> Unit) {
            this.map(fn)
        }
    }
}
