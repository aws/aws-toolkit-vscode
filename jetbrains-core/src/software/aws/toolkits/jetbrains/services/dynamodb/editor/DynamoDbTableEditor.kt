// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.codeHighlighting.BackgroundEditorHighlighter
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorLocation
import com.intellij.openapi.fileEditor.FileEditorState
import com.intellij.openapi.fileEditor.FileEditorStateLevel
import com.intellij.openapi.util.UserDataHolderBase
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLoadingPanel
import com.intellij.ui.components.JBPanelWithEmptyText
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.dynamodb.model.ExecuteStatementRequest
import software.amazon.awssdk.services.dynamodb.model.KeySchemaElement
import software.amazon.awssdk.services.dynamodb.model.KeyType
import software.aws.toolkits.core.utils.debug
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.dynamodb.DynamoDbUtils.executeStatementPaginator
import software.aws.toolkits.jetbrains.services.dynamodb.Index
import software.aws.toolkits.jetbrains.services.dynamodb.toAttribute
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineBgContext
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.beans.PropertyChangeListener
import javax.swing.JComponent

class DynamoDbTableEditor(private val dynamoTable: DynamoDbVirtualFile) : UserDataHolderBase(), FileEditor {
    data class EditorState(var maxResults: Int = DEFAULT_MAX_RESULTS)

    private val coroutineScope = ApplicationThreadPoolScope("DynamoDbTableEditor", this)
    private val bg = getCoroutineBgContext()
    private val edt = getCoroutineUiContext()

    val editorState = EditorState()

    private val loadingPanel = JBLoadingPanel(BorderLayout(), this)

    private lateinit var searchPanel: SearchPanel
    private val searchResults = SearchResultsPanel()

    init {
        // Async load in the editor so we can get the table info
        loadingPanel.startLoading()

        coroutineScope.launch {
            val tableInfo = try {
                getTableInfo(dynamoTable.tableName)
            } catch (e: Exception) {
                withContext(edt) {
                    loadingPanel.add(
                        JBPanelWithEmptyText().also {
                            it.emptyText.setText(
                                message("dynamodb.viewer.open.failed.with_error", e.message ?: message("general.unknown_error")),
                                SimpleTextAttributes.ERROR_ATTRIBUTES
                            )
                        },
                        BorderLayout.CENTER
                    )
                    loadingPanel.stopLoading()
                }
                return@launch
            }

            withContext(edt) {
                searchPanel = SearchPanel(
                    tableInfo = tableInfo,
                    initialSearchType = SearchPanel.SearchType.Scan,
                    initialSearchIndex = tableInfo.tableIndex,
                    runAction = { executeSearch() }
                )

                loadingPanel.add(searchPanel.getComponent(), BorderLayout.NORTH)
                loadingPanel.add(searchResults, BorderLayout.CENTER)

                executeSearch(PREVIEW_SIZE)

                loadingPanel.stopLoading()
            }
        }
    }

    private fun getTableInfo(tableName: String): TableInfo {
        fun keySchemaToIndex(name: String?, keySchema: List<KeySchemaElement>) = Index(
            displayName = name ?: tableName,
            indexName = name,
            partitionKey = keySchema.first { it.keyType() == KeyType.HASH }.attributeName(),
            sortKey = keySchema.find { it.keyType() == KeyType.RANGE }?.attributeName()
        )

        val describeResponse = dynamoTable.dynamoDbClient.describeTable {
            it.tableName(tableName)
        }.table()

        return TableInfo(
            tableName = tableName,
            tableIndex = keySchemaToIndex(name = null, describeResponse.keySchema()),
            localSecondary = describeResponse.localSecondaryIndexes().map {
                keySchemaToIndex(it.indexName(), it.keySchema())
            },
            globalSecondary = describeResponse.globalSecondaryIndexes().map {
                keySchemaToIndex(it.indexName(), it.keySchema())
            }
        )
    }

    private fun executeSearch(maxResults: Int = editorState.maxResults) {
        coroutineScope.launch(edt) {
            searchResults.setBusy(true)
            val (index, partiqlStatement) = searchPanel.getSearchQuery()

            withContext(bg) {
                LOG.debug { "Querying Dynamo with '$partiqlStatement'" }

                val request = ExecuteStatementRequest.builder().statement(partiqlStatement).build()
                try {
                    val results = dynamoTable.dynamoDbClient.executeStatementPaginator(request)
                        .flatMap { it.items().asSequence() }
                        .map { it.mapValues { attr -> attr.value.toAttribute() } }
                        .take(maxResults)
                        .toList()

                    withContext(edt) {
                        searchResults.setResults(index, results)
                        searchResults.setBusy(false)
                    }
                } catch (e: Exception) {
                    withContext(edt) {
                        searchResults.setError(e)
                        searchResults.setBusy(false)
                    }
                }
            }
        }
    }

    override fun getComponent(): JComponent = loadingPanel

    override fun getName(): String = "DynamoDBTable"

    override fun getPreferredFocusedComponent(): JComponent? = null

    override fun isValid(): Boolean = true

    override fun getCurrentLocation(): FileEditorLocation? = null

    override fun getState(level: FileEditorStateLevel): FileEditorState = FileEditorState.INSTANCE

    override fun isModified(): Boolean = false

    override fun dispose() {}

    override fun addPropertyChangeListener(listener: PropertyChangeListener) {}

    override fun deselectNotify() {}

    override fun getBackgroundHighlighter(): BackgroundEditorHighlighter? = null

    override fun selectNotify() {}

    override fun removePropertyChangeListener(listener: PropertyChangeListener) {}

    override fun setState(state: FileEditorState) {}

    companion object {
        private val LOG = getLogger<SearchPanel>()

        /**
         * The number of rows to list with the initial scan preview
         */
        private const val PREVIEW_SIZE = 20

        /* Matches the options from the console */
        val MAX_RESULTS_OPTIONS = listOf(50, 100, 200, 300)
        private const val DEFAULT_MAX_RESULTS = 50
    }
}
