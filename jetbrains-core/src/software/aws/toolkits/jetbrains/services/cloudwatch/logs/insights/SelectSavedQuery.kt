// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.icons.AllIcons
import com.intellij.ui.SimpleListCellRenderer
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryDefinition
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import software.aws.toolkits.jetbrains.ui.ResourceSelector
import javax.swing.JButton
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTextArea

class SelectSavedQuery(
    private val connectionSettings: ConnectionSettings
) {
    lateinit var resourceSelector: ResourceSelector<QueryDefinition>
        private set
    private lateinit var basePanel: JPanel
    private lateinit var logGroups: JTextArea
    private lateinit var queryString: JTextArea
    private lateinit var refreshButton: JButton

    private fun createUIComponents() {
        resourceSelector = ResourceSelector.builder()
            .resource { CloudWatchResources.DESCRIBE_QUERY_DEFINITIONS }
            .awsConnection { connectionSettings }
            .customRenderer(SimpleListCellRenderer.create("") { it.name() })
            .build()

        // select the first entry, if applicable
        resourceSelector.selectedItem { true }

        resourceSelector.addActionListener {
            resourceSelector.selected()?.let {
                logGroups.text = it.logGroupNames().joinToString("\n")
                queryString.text = it.queryString()
                // reset to the start, since setting the text moves the cursor to the end,
                // which results in scrolling to the bottom right corner if there's enough text
                logGroups.caretPosition = 0
                queryString.caretPosition = 0
            }
        }
    }

    init {
        refreshButton.icon = AllIcons.Actions.Refresh
        refreshButton.addActionListener {
            logGroups.text = ""
            queryString.text = ""
            resourceSelector.reload(forceFetch = true)
        }
    }

    fun getComponent(): JComponent = basePanel
}
