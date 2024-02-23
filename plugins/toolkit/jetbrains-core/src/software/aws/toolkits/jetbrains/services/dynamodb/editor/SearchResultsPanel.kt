// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.ui.IdeBorderFactory
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SideBorder
import com.intellij.util.ui.components.BorderLayoutPanel
import software.aws.toolkits.jetbrains.services.dynamodb.Index
import software.aws.toolkits.jetbrains.services.dynamodb.SearchResults

class SearchResultsPanel : BorderLayoutPanel() {
    private val resultsTable = TableResults()

    init {
        val primaryToolbar = createToolbar("aws.toolkit.dynamoViewer.toolbar.primary")
        val secondaryToolbar = createToolbar("aws.toolkit.dynamoViewer.toolbar.secondary")

        val toolbarPanel = BorderLayoutPanel().apply {
            addToLeft(primaryToolbar.component)
            addToRight(secondaryToolbar.component)
        }

        addToTop(toolbarPanel)
        addToCenter(ScrollPaneFactory.createScrollPane(resultsTable))

        border = IdeBorderFactory.createBorder(SideBorder.TOP)
    }

    private fun createToolbar(group: String): ActionToolbar {
        val actionManager = ActionManager.getInstance()
        val actionGroup = actionManager.getAction(group) as ActionGroup

        val toolbar = actionManager.createActionToolbar(ActionPlaces.UNKNOWN, actionGroup, true)
        toolbar.setTargetComponent(resultsTable)
        return toolbar
    }

    fun setBusy(isBusy: Boolean) {
        resultsTable.setPaintBusy(isBusy)
    }

    fun setResults(index: Index, results: SearchResults) {
        resultsTable.setResults(index, results)
    }

    fun setError(e: Exception) {
        resultsTable.setError(e)
    }
}
