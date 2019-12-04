// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.editor.colors.EditorColorsManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.ui.JBSplitter
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.util.Alarm
import software.aws.toolkits.jetbrains.components.telemetry.LoggingDialogWrapper
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.schemas.SchemaViewer
import software.aws.toolkits.jetbrains.services.schemas.code.DownloadCodeForSchemaDialog
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Color
import java.awt.Dimension
import java.awt.Font
import java.awt.event.ActionEvent
import java.util.concurrent.CompletionStage
import java.util.concurrent.locks.ReentrantLock
import javax.swing.Action
import javax.swing.DefaultComboBoxModel
import javax.swing.DefaultListModel
import javax.swing.JButton
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JPanel
import javax.swing.JTextArea
import javax.swing.JTextField
import javax.swing.ListSelectionModel
import javax.swing.border.EmptyBorder
import javax.swing.event.DocumentEvent
import javax.swing.event.DocumentListener
import javax.swing.text.DefaultHighlighter
import kotlin.concurrent.withLock

abstract class SchemasSearchDialogBase<T : SchemaSearchResultBase, U : SchemaSearchDialogState<T>>(
    protected val project: Project,
    private val schemaViewer: SchemaViewer,
    private val headerText: String,
    private val onCancelCallback: (U) -> Unit,
    private val alarmThreadToUse: Alarm.ThreadToUse = Alarm.ThreadToUse.SWING_THREAD
) :
    SchemaSearchDialog<T, U>, LoggingDialogWrapper(project), Disposable {

    private val DEFAULT_PADDING = 10
    private val HIGHLIGHT_COLOR = Color.YELLOW

    val searchTextField = JTextField()
    private val SEARCH_DELAY_MS: Long = 300
    private val searchTextAlarm = Alarm(alarmThreadToUse, this)

    val resultsModel = DefaultListModel<T>()
    val resultsList = JBList<T>(resultsModel)
    private val resultsLock = ReentrantLock()

    val versionsModel: DefaultComboBoxModel<SchemaSearchResultVersion> = DefaultComboBoxModel()
    val versionsCombo = JComboBox<SchemaSearchResultVersion>(versionsModel)

    val previewText = JTextArea()
    // EditorTextFieldProvider.getInstance().getEditorField(JsonLanguage.INSTANCE, project, listOf(MonospaceEditorCustomization(), EditorCustomization { it.isViewer = true }))
    private val previewScrollPane = JBScrollPane()

    private val openDownloadDialogAction = OpenCodeDownloadDialogAction()
    private val closeDialogAction = CloseSearchDialogAction()

    private val contentPanel = JPanel(BorderLayout(0, DEFAULT_PADDING))

    val currentSearchErrors: MutableList<SchemaSearchError> = ArrayList<SchemaSearchError>()

    init {
        title = message("schemas.search.title")

        resultsList.selectionMode = ListSelectionModel.SINGLE_SELECTION
        resultsList.setEmptyText(message("schemas.search.no_results"))

        versionsCombo.isEditable = false
        versionsCombo.isEnabled = false

        val editorColorsScheme = EditorColorsManager.getInstance().getGlobalScheme()
        previewText.font = Font(editorColorsScheme.editorFontName, Font.PLAIN, editorColorsScheme.editorFontSize)
        previewText.isEditable = false

        initLayout()

        super.init()

        getDownloadButton()?.isEnabled = false
    }

    private fun initListeners() {
        resultsList.addListSelectionListener({
            if (it.getValueIsAdjusting()) return@addListSelectionListener

            getDownloadButton()?.isEnabled = true

            val selectedSchema = selectedSchema()
            if (selectedSchema != null) {
                updateSchemaVersions(selectedSchema)
                previewSchema(selectedSchema)
            }
        })

        versionsCombo.addActionListener({
            val selectedSchema = selectedSchema()

            if (selectedSchema != null && selectedSchemaVersion() != null) {
                previewSchema(selectedSchema)
            }
        })

        searchTextField.document.addDocumentListener(object : DocumentListener {
            override fun changedUpdate(e: DocumentEvent?) = search()
            override fun insertUpdate(e: DocumentEvent?) = search()
            override fun removeUpdate(e: DocumentEvent?) = search()

            private fun search() {
                if (searchTextAlarm.isDisposed) return

                searchTextAlarm.cancelAllRequests()

                searchTextAlarm.addRequest({
                    val searchText = searchTextField.text
                    println("searching $searchText ...")

                    if (searchText.isNullOrEmpty()) {
                        clearState()
                        return@addRequest
                    }

                    clearState()
                    resultsList.setEmptyText(message("schemas.search.searching"))
                    searchSchemas(searchText, { onSearchResultsReturned(it) }, { onErrorSearchingRegistry(it) })
                }, SEARCH_DELAY_MS)
            }

            private fun clearState() {
                previewText.text = ""
                resultsList.setEmptyText(message("schemas.search.no_results"))
                getDownloadButton()?.isEnabled = false
                resultsModel.removeAllElements()
                versionsModel.removeAllElements()
                currentSearchErrors.clear()
            }
        })
    }

    private fun onSearchResultsReturned(searchResults: List<T>) {
        runInEdt(ModalityState.any()) {
            resultsLock.withLock {
                resultsList.setEmptyText(message("schemas.search.no_results"))
                searchResults.forEach { result -> resultsModel.addElement(result) }
                resultsList.revalidate()
            }
        }
    }

    private fun onErrorSearchingRegistry(searchError: SchemaSearchError) {
        runInEdt(ModalityState.any()) {
            resultsLock.withLock {
                resultsList.setEmptyText(message("schemas.search.no_results"))
                currentSearchErrors.add(searchError)
            }
        }
    }

    private fun updateSchemaVersions(selectedSchema: T, selectedSchemaVersion: SchemaSearchResultVersion? = null) {
        versionsModel.removeAllElements()

        val newVersions = selectedSchema.versions
        newVersions.forEach { version -> versionsModel.addElement(SchemaSearchResultVersion(version)) }

        versionsModel.selectedItem = selectedSchemaVersion ?: versionsCombo.getItemAt(0)
        versionsCombo.isEnabled = newVersions.size > 1
    }

    override fun doValidate(): ValidationInfo? {
        if (currentSearchErrors.isEmpty())
            return null

        val registriesInError = currentSearchErrors.map { message("schemas.search.error.registry", it.registryName, it.errorMessage) }
        val registriesInErrorString = registriesInError.joinToString(", ")

        return ValidationInfo(message("schemas.search.error", registriesInErrorString))
    }

    private fun previewSchema(selectedSchema: T) {
        val selectedSchemaVersion = selectedSchemaVersion()
        selectedSchemaVersion?.let {
            emitTelemetry("PreviewSchemaDuringSearch")
            downloadSchemaContent(selectedSchema, selectedSchemaVersion.version)
                .thenApply { schemaText ->
                    runInEdt(ModalityState.any()) {
                        previewScrollPane.verticalScrollBar.value = previewScrollPane.verticalScrollBar.minimum
                        previewScrollPane.horizontalScrollBar.value = previewScrollPane.horizontalScrollBar.minimum

                        previewText.text = schemaText
                        previewText.caretPosition = 0

                        val searchText = searchTextField.text
                        if (!searchText.isNullOrEmpty()) {
                            val resultsInSchema = findAllOccurrencesInString(schemaText, searchText)

                            if (!resultsInSchema.isEmpty()) {
                                val highlighter = previewText.highlighter
                                val painter = DefaultHighlighter.DefaultHighlightPainter(HIGHLIGHT_COLOR)

                                resultsInSchema.forEach { startIndex ->
                                    val endIndex = startIndex + searchText.length
                                    highlighter.addHighlight(startIndex, endIndex, painter)
                                }
                                previewText.caretPosition = resultsInSchema[0]
                            }
                        }
                    }
                }
        }
    }

    private fun findAllOccurrencesInString(string: String, search: String): List<Int> {
        val occurrences = ArrayList<Int>()
        var index = string.indexOf(search)
        while (index >= 0) {
            occurrences.add(index)
            index = string.indexOf(search, index + 1)
        }
        return occurrences
    }

    override fun initializeNew() {
        initListeners()
        initValidation()
    }

    override fun initializeFromState(state: U) {
        searchTextField.text = state.searchText

        resultsLock.withLock {
            resultsModel.removeAllElements()
            state.searchResults.forEach { result -> resultsModel.addElement(result) }

            val selectedResult = state.selectedResult
            if (selectedResult != null) {
                resultsList.setSelectedValue(selectedResult, true)
                updateSchemaVersions(selectedResult, if (state.selectedVersion == null) null else SchemaSearchResultVersion(state.selectedVersion))
                previewSchema(selectedResult)

                getDownloadButton()?.isEnabled = true
            }

            initListeners()
            initValidation()
        }
    }

    abstract fun getCurrentState(): U

    fun currentSearchText(): String = searchTextField.text

    fun selectedSchema(): T? = resultsList.selectedValue

    fun selectedSchemaName() = selectedSchema()?.name

    fun selectedSchemaVersion(): SchemaSearchResultVersion? =
        if (versionsCombo.selectedIndex >= 0) versionsCombo.getItemAt(versionsCombo.selectedIndex) else null

    abstract fun selectedSchemaRegistry(): String?

    private fun initLayout() {
        val top = JPanel(BorderLayout(DEFAULT_PADDING, 0))
        top.add(JBLabel(headerText), BorderLayout.WEST)
        top.add(searchTextField, BorderLayout.CENTER)

        val resultsScrollPane = JBScrollPane()
        resultsScrollPane.setViewportView(resultsList)
        resultsScrollPane.setPreferredSize(Dimension(350, 600))

        previewScrollPane.setViewportView(previewText)
        previewScrollPane.setPreferredSize(Dimension(450, 600))

        val right = JPanel(BorderLayout(0, DEFAULT_PADDING))
        right.add(versionsCombo, BorderLayout.NORTH)
        right.add(previewScrollPane, BorderLayout.CENTER)

        val previewResultsSplitter = JBSplitter()
        previewResultsSplitter.firstComponent = resultsScrollPane
        previewResultsSplitter.secondComponent = right
        previewResultsSplitter.splitterProportionKey = selectedSchemaRegistry()

        val center = JPanel(BorderLayout(DEFAULT_PADDING, 0))
        center.add(previewResultsSplitter, BorderLayout.CENTER)

        contentPanel.setSize(700, 800)
        contentPanel.add(top, BorderLayout.PAGE_START)
        contentPanel.add(center, BorderLayout.CENTER)
        contentPanel.setBorder(EmptyBorder(DEFAULT_PADDING, DEFAULT_PADDING, DEFAULT_PADDING, DEFAULT_PADDING))
    }

    abstract fun downloadSchemaContent(schema: T, version: String): CompletionStage<String>

    protected fun doDownloadSchemaContent(registryName: String, schemaName: String, version: String): CompletionStage<String> =
        schemaViewer.downloadPrettySchema(schemaName, registryName, version, contentPanel)

    abstract fun searchSchemas(
        searchText: String,
        incrementalResultsCallback: OnSearchResultReturned<T>,
        registrySearchErrorCallback: OnSearchResultError
    )

    override fun createCenterPanel(): JComponent? = contentPanel

    override fun getPreferredFocusedComponent(): JComponent? = searchTextField

    override fun getHelpId(): String? = HelpIds.SCHEMA_SEARCH_DIALOG.id

    override fun getOKAction(): Action = openDownloadDialogAction

    override fun doOKAction() {
        // Intercept OK action as it is actually triggers code download dialog independently
    }

    override fun getCancelAction(): Action = closeDialogAction

    override fun doCancelAction() {
        onCancelCallback(getCurrentState())
        super.doCancelAction()
    }

    fun getDownloadButton(): JButton? = getButton(openDownloadDialogAction)

    override fun getNamespace(): String = "SchemasSearchDialog"

    override fun dispose() {
        super.dispose()
    }

    private inner class OpenCodeDownloadDialogAction : OkAction() {
        init {
            putValue(Action.NAME, message("schemas.schema.download_code_bindings.action"))
        }

        override fun doAction(e: ActionEvent) {
            val currentSchema = selectedSchemaName()
            val currentSchemaRegistry = selectedSchemaRegistry()

            if (currentSchema != null && currentSchemaRegistry != null) {

                emitTelemetry("DownloadCodeAction")

                DownloadCodeForSchemaDialog(
                    project,
                    currentSchema,
                    currentSchemaRegistry,
                    selectedSchemaVersion()?.version,
                    onClose = { close(OK_EXIT_CODE) }
                ).show()
            }
        }
    }

    private inner class CloseSearchDialogAction : DialogWrapperAction(message("general.close_button")) {
        override fun doAction(e: ActionEvent) {
            doCancelAction()
        }
    }
}
