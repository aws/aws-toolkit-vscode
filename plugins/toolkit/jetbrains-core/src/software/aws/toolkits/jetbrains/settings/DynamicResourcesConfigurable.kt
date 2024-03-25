// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.settings

import com.intellij.openapi.options.BoundConfigurable
import com.intellij.openapi.project.ProjectManager
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.messages.MessagesService
import com.intellij.ui.CheckBoxList
import com.intellij.ui.FilterComponent
import com.intellij.ui.ListSpeedSearch
import com.intellij.ui.dsl.builder.Align
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.gridLayout.VerticalAlign
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.utils.replace
import software.aws.toolkits.jetbrains.core.coroutines.applicationCoroutineScope
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.explorer.ExplorerToolWindow
import software.aws.toolkits.jetbrains.feedback.sendFeedbackWithExperimentsMetadata
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceSupportedTypes
import software.aws.toolkits.jetbrains.services.dynamic.explorer.OtherResourcesNode
import software.aws.toolkits.jetbrains.ui.feedback.FEEDBACK_SOURCE
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.FeedbackTelemetry
import javax.swing.ListSelectionModel

class DynamicResourcesConfigurable : BoundConfigurable(message("aws.settings.dynamic_resources_configurable.title")) {

    private val coroutineScope = applicationCoroutineScope()
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
        coroutineScope.launch(getCoroutineBgContext()) {
            allResources.addAll(DynamicResourceSupportedTypes.getInstance().getSupportedTypes())
            withContext(getCoroutineUiContext()) {
                updateCheckboxList()
            }
        }
        row {
            cell(filter).resizableColumn().align(Align.FILL)
            link(message("aws.settings.dynamic_resources_configurable.suggest_types.prompt")) {
                showTypeSuggestionBox()?.let { suggestion ->
                    submitSuggestion(suggestion)
                }
            }
        }
        row {
            scrollCell(checklist)
                .onIsModified { selected != DynamicResourcesSettings.getInstance().selected }
                .onApply {
                    DynamicResourcesSettings.getInstance().selected = selected
                    refreshAwsExplorer()
                }
                .onReset {
                    selected.replace(DynamicResourcesSettings.getInstance().selected)
                    updateCheckboxList()
                }.resizableColumn().align(Align.FILL)

            panel {
                val sizeGroup = "buttons"
                row {
                    button(message("aws.settings.dynamic_resources_configurable.select_all")) {
                        checklist.toggleAll(true)
                    }.widthGroup(sizeGroup)
                }
                row {
                    button(message("aws.settings.dynamic_resources_configurable.clear_all")) {
                        checklist.toggleAll(false)
                    }.widthGroup(sizeGroup)
                }
            }.verticalAlign(VerticalAlign.TOP)
        }.resizableRow()
    }

    private fun submitSuggestion(suggestion: String) {
        coroutineScope.launch(getCoroutineBgContext()) {
            try {
                sendFeedbackWithExperimentsMetadata(Sentiment.NEGATIVE, suggestion, mapOf(FEEDBACK_SOURCE to "Resource Type Suggestions")).also {
                    FeedbackTelemetry.result(project = null, success = true)
                }
            } catch (e: Exception) {
                e.notifyError(message("feedback.submit_failed", e))
                FeedbackTelemetry.result(project = null, success = false)
            }
        }
    }

    private fun CheckBoxList<*>.toggleAll(state: Boolean) {
        for (idx in 0..model.size - 1) {
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

    companion object {
        private const val INITIAL_INPUT = "AWS::"
        private const val MAX_LENGTH = 2000

        private fun showTypeSuggestionBox(): String? = MessagesService.getInstance().showMultilineInputDialog(
            project = null,
            message = message("aws.settings.dynamic_resources_configurable.suggest_types.dialog.message"),
            title = message("aws.settings.dynamic_resources_configurable.suggest_types.dialog.title"),
            initialValue = INITIAL_INPUT,
            icon = Messages.getQuestionIcon(),
            object : InputValidator {
                override fun checkInput(inputString: String?) = validateSuggestion(inputString)
                override fun canClose(inputString: String?) = validateSuggestion(inputString)
            }
        )?.takeIf { it.isNotBlank() }

        private fun validateSuggestion(inputString: String?) =
            inputString != null && inputString.isNotBlank() && inputString != INITIAL_INPUT && inputString.length <= MAX_LENGTH
    }
}
