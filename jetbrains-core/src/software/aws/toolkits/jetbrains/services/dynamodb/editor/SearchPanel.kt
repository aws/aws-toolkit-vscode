// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.HideableDecorator
import com.intellij.ui.layout.panel
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.jetbrains.services.dynamodb.Index
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import javax.swing.JComponent
import javax.swing.JPanel

class SearchPanel(private val tableInfo: TableInfo, initialSearchType: SearchType, initialSearchIndex: Index, runAction: () -> Unit) {
    enum class SearchType { Scan, Query }

    private val searchIndexModel = IndexComboBoxModel(tableInfo)

    var searchType = initialSearchType
    var searchIndex = initialSearchIndex

    private val queryScanPanel: DialogPanel = panel {
        row {
            label(message("dynamodb.viewer.search.index.label"))
            comboBox(searchIndexModel, ::searchIndex, IndexRenderer(searchIndexModel)).constraints(growX, pushX)
        }

        row {
            button(message("dynamodb.viewer.search.run.title")) { runAction() }
        }
    }.withBorder(JBUI.Borders.empty(0, UIUtil.PANEL_REGULAR_INSETS.left))

    private val panel: JComponent = JPanel(BorderLayout()).apply {
        val decorator = HideableDecorator(this, message("dynamodb.viewer.search.title"), false)
        decorator.setOn(false) // Collapse by default
        decorator.setContentComponent(queryScanPanel)
    }

    fun getSearchQuery(): Pair<Index, String> {
        queryScanPanel.apply()

        return searchIndex to buildString {
            append("""SELECT * FROM "${tableInfo.tableName}"""")
            searchIndex.indexName?.let {
                append("""."$it"""")
            }

            if (searchType == SearchType.Query) {
                append(" WHERE ")
                TODO()
            }
        }
    }

    fun getComponent() = panel
}
