// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.openapi.ui.DialogPanel
import com.intellij.ui.HideableDecorator
import com.intellij.ui.dsl.builder.AlignX
import com.intellij.ui.dsl.builder.bindItem
import com.intellij.ui.dsl.builder.panel
import com.intellij.ui.dsl.builder.toNullableProperty
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
            comboBox(searchIndexModel, IndexRenderer(searchIndexModel)).bindItem(::searchIndex.toNullableProperty()).align(AlignX.FILL)
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

    fun getComponent() = panel

    fun getSearchQuery(): Pair<Index, String> {
        queryScanPanel.apply()

        val fromField = buildString {
            append('"')
            append(verifyString(tableInfo.tableName))
            append('"')

            searchIndex.indexName?.let {
                append('.')
                append('"')
                append(verifyString(it))
                append('"')
            }
        }

        return searchIndex to buildString {
            append("SELECT * FROM ")
            append(fromField)

            if (searchType == SearchType.Query) {
                append(" WHERE ")
                TODO()
            }
        }
    }

    private fun verifyString(str: String): String = str.takeIf {
        str.matches(NAMING_RULES)
    } ?: throw IllegalArgumentException("'$str' does not match $NAMING_RULES")

    private companion object {
        // https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.NamingRulesDataTypes.html#HowItWorks.NamingRules
        private val NAMING_RULES = """^[A-Za-z0-9_\-.]+${'$'}""".toRegex()
    }
}
