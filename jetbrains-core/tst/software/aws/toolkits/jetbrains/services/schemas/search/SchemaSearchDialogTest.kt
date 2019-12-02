// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndWait
import com.intellij.util.Alarm
import io.mockk.every
import io.mockk.invoke
import io.mockk.mockk
import io.mockk.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Ignore
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.schemas.SchemaViewer
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture

class SchemaSearchDialogTest {

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val REGISTRY1 = "Registry1"
    private val REGISTRY2 = "Registry2"
    private val SCHEMA1 = "Schema1"
    private val SCHEMA1_CONTENTS = "Schema1_contents"
    private val SCHEMA2 = "Schema2"
    private val SCHEMA2_CONTENTS = "Schema2_contents"
    private val FIRST_VERSION = "3"
    private val LAST_VERSION = "1"
    private val VERSIONS = listOf(FIRST_VERSION, "2", LAST_VERSION)
    private val SEARCH_CRITERIA = "contents"

    private val mockSchemaSearchExecutor = mockk<SchemaSearchExecutor>()
    private val mockSchemaViewer = mockk<SchemaViewer>()

    @Test
    fun initializeSearchRegistryDialog() {
        val future = CompletableFuture<SchemaSearchSingleRegistryDialog>()
        runInEdtAndWait {
            val dialog = initSingleRegistryDialog()

            future.complete(dialog)
        }

        future.thenApply {
            assertInitialDialogState(it)
        }
    }

    @Test
    fun initializeSearchAllRegistriesDialog() {
        val future = CompletableFuture<SchemaSearchAllRegistriesDialog>()
        runInEdtAndWait {
            val dialog = initAllRegistriesDialog()

            future.complete(dialog)
        }

        future.thenApply {
            assertInitialDialogState(it)
        }
    }

    @Test
    fun initializeSearchRegistryDialogFromState() {
        val result1 = SchemaSearchResult(SCHEMA1, VERSIONS)
        val result2 = SchemaSearchResult(SCHEMA2, VERSIONS)
        val searchResults = listOf(result1, result2)

        every { mockSchemaSearchExecutor.searchSchemasInRegistry(REGISTRY1, SEARCH_CRITERIA, captureLambda(), any()) } answers
            { lambda<OnSearchResultReturned<SchemaSearchResult>>().invoke(searchResults) }

        every { mockSchemaViewer.downloadPrettySchema(SCHEMA2, REGISTRY1, any(), any()) } returns completableFutureOf(SCHEMA2_CONTENTS)

        val future = CompletableFuture<SchemaSearchSingleRegistryDialog>()
        runInEdtAndWait {
            val dialog = initSingleRegistryDialog(SchemaSearchSingleRegistyDialogState(SEARCH_CRITERIA, searchResults, result2, LAST_VERSION))

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchResultSelectedDialogState(
                it,
                SCHEMA2_CONTENTS,
                VERSIONS.map { SchemaSearchResultVersion(it) },
                SchemaSearchResultVersion(LAST_VERSION)
            )
        }
    }

    @Test
    fun initializeSearchAllRegistriesDialogFromState() {
        val result1 = SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1)
        val result2 = SchemaSearchResultWithRegistry(SCHEMA2, VERSIONS, REGISTRY2)
        val searchResults = listOf(result1, result2)

        every { mockSchemaSearchExecutor.searchSchemasAcrossAllRegistries(SEARCH_CRITERIA, captureLambda(), any()) } answers
            { lambda<OnSearchResultReturned<SchemaSearchResultWithRegistry>>().invoke(searchResults) }

        every { mockSchemaViewer.downloadPrettySchema(SCHEMA2, REGISTRY2, any(), any()) } returns completableFutureOf(SCHEMA2_CONTENTS)

        val future = CompletableFuture<SchemaSearchAllRegistriesDialog>()
        runInEdtAndWait {
            val dialog = initAllRegistriesDialog(SchemaSearchAllRegistriesDialogState(SEARCH_CRITERIA, searchResults, result2, LAST_VERSION))

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchResultSelectedDialogState(
                it,
                SCHEMA2_CONTENTS,
                VERSIONS.map { SchemaSearchResultVersion(it) },
                SchemaSearchResultVersion(LAST_VERSION)
            )
        }
    }

    @Test
    fun singleRegistrySearch() {
        val future = CompletableFuture<SchemaSearchSingleRegistryDialog>()
        runInEdtAndWait {
            val dialog = initSingleRegistryDialog()

            dialog.searchTextField.text = SEARCH_CRITERIA

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchingDialogState(it)

            verify { mockSchemaSearchExecutor.searchSchemasInRegistry(REGISTRY1, SEARCH_CRITERIA, any(), any()) }
        }
    }

    @Test
    fun allRegistriesSearch() {
        val future = CompletableFuture<SchemaSearchAllRegistriesDialog>()
        runInEdtAndWait {
            val dialog = initAllRegistriesDialog()

            dialog.searchTextField.text = SEARCH_CRITERIA

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchingDialogState(it)

            verify { mockSchemaSearchExecutor.searchSchemasAcrossAllRegistries(SEARCH_CRITERIA, any(), any()) }
        }
    }

    @Test
    fun singleRegistrySearchWithResults() {
        val searchResults = listOf(SchemaSearchResult(SCHEMA1, VERSIONS))

        every { mockSchemaSearchExecutor.searchSchemasInRegistry(REGISTRY1, SEARCH_CRITERIA, captureLambda(), any()) } answers
            { lambda<OnSearchResultReturned<SchemaSearchResult>>().invoke(searchResults) }

        val future = CompletableFuture<SchemaSearchSingleRegistryDialog>()
        runInEdtAndWait {
            val dialog = initSingleRegistryDialog()

            dialog.searchTextField.text = SEARCH_CRITERIA

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchResultsDialogState(it, searchResults, emptyList())
        }
    }

    @Test
    fun singleRegistrySearchError() {
        val searchError = SchemaSearchError(REGISTRY1, "someErrorMessage")

        every { mockSchemaSearchExecutor.searchSchemasInRegistry(REGISTRY1, SEARCH_CRITERIA, any(), captureLambda()) } answers
            { lambda<OnSearchResultError>().invoke(searchError) }

        val future = CompletableFuture<SchemaSearchSingleRegistryDialog>()
        runInEdtAndWait {
            val dialog = initSingleRegistryDialog()

            dialog.searchTextField.text = SEARCH_CRITERIA

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchResultsDialogState(it, emptyList(), listOf(searchError))
        }
    }

    @Test
    fun allRegistriesSearchWithResults() {
        val searchResultsPart1 = listOf(SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1))
        val searchResultsPart2 = listOf(SchemaSearchResultWithRegistry(SCHEMA2, VERSIONS, REGISTRY2))

        every { mockSchemaSearchExecutor.searchSchemasAcrossAllRegistries(SEARCH_CRITERIA, captureLambda(), any()) } answers
            {
                lambda<OnSearchResultReturned<SchemaSearchResultWithRegistry>>().invoke(searchResultsPart1)
                lambda<OnSearchResultReturned<SchemaSearchResultWithRegistry>>().invoke(searchResultsPart2)
            }

        val future = CompletableFuture<SchemaSearchAllRegistriesDialog>()
        runInEdtAndWait {
            val dialog = initAllRegistriesDialog()

            dialog.searchTextField.text = SEARCH_CRITERIA

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchResultsDialogState(it, searchResultsPart1.union(searchResultsPart2), emptyList())

            verify { mockSchemaSearchExecutor.searchSchemasAcrossAllRegistries(SEARCH_CRITERIA, any(), any()) }
        }
    }

    @Test
    @Ignore("Due to mockk bug/limitation, multiple captureLambda invocations on same mock do not work.")
    fun allRegistriesSearchError() {
        val searchResultsPart1 = listOf(SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1))
        val searchError = SchemaSearchError(REGISTRY1, "someErrorMessage")

        every { mockSchemaSearchExecutor.searchSchemasAcrossAllRegistries(SEARCH_CRITERIA, captureLambda(), captureLambda()) } answers
            {
                lambda<OnSearchResultReturned<SchemaSearchResultWithRegistry>>().invoke(searchResultsPart1)
                lambda<OnSearchResultError>().invoke(searchError)
            }

        val future = CompletableFuture<SchemaSearchAllRegistriesDialog>()
        runInEdtAndWait {
            val dialog = initAllRegistriesDialog()

            dialog.searchTextField.text = SEARCH_CRITERIA

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchResultsDialogState(it, searchResultsPart1, listOf(searchError))

            verify { mockSchemaSearchExecutor.searchSchemasAcrossAllRegistries(SEARCH_CRITERIA, any(), any()) }
        }
    }

    @Test
    fun singleRegistrySearchResultSelected() {
        val searchResults = listOf(SchemaSearchResult(SCHEMA1, VERSIONS))

        every { mockSchemaSearchExecutor.searchSchemasInRegistry(REGISTRY1, SEARCH_CRITERIA, captureLambda(), any()) } answers
            { lambda<OnSearchResultReturned<SchemaSearchResult>>().invoke(searchResults) }

        every { mockSchemaViewer.downloadPrettySchema(SCHEMA1, REGISTRY1, any(), any()) } returns completableFutureOf(SCHEMA1_CONTENTS)

        val future = CompletableFuture<SchemaSearchSingleRegistryDialog>()
        runInEdtAndWait {
            val dialog = initSingleRegistryDialog()

            dialog.searchTextField.text = SEARCH_CRITERIA
            dialog.resultsList.selectedIndex = 0

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchResultSelectedDialogState(
                it,
                SCHEMA1_CONTENTS,
                VERSIONS.map { SchemaSearchResultVersion(it) },
                SchemaSearchResultVersion(FIRST_VERSION)
            )
        }
    }

    @Test
    fun allRegistriesSearchResultSelected() {
        val searchResults = listOf(
            SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1),
            SchemaSearchResultWithRegistry(SCHEMA2, VERSIONS, REGISTRY2)
        )

        every { mockSchemaSearchExecutor.searchSchemasAcrossAllRegistries(SEARCH_CRITERIA, captureLambda(), any()) } answers
            { lambda<OnSearchResultReturned<SchemaSearchResultWithRegistry>>().invoke(searchResults) }

        every { mockSchemaViewer.downloadPrettySchema(SCHEMA1, REGISTRY1, any(), any()) } returns completableFutureOf(SCHEMA1_CONTENTS)

        val future = CompletableFuture<SchemaSearchAllRegistriesDialog>()
        runInEdtAndWait {
            val dialog = initAllRegistriesDialog()

            dialog.searchTextField.text = SEARCH_CRITERIA
            dialog.resultsList.selectedIndex = 0

            future.complete(dialog)
        }

        future.thenApply {
            assertSearchResultSelectedDialogState(
                it,
                SCHEMA1_CONTENTS,
                VERSIONS.map { SchemaSearchResultVersion(it) },
                SchemaSearchResultVersion(FIRST_VERSION)
            )

            verify { mockSchemaViewer.downloadPrettySchema(SCHEMA1, REGISTRY1, FIRST_VERSION, any()) }
        }
    }

    private fun initSingleRegistryDialog(state: SchemaSearchSingleRegistyDialogState? = null): SchemaSearchSingleRegistryDialog {
        val dialog =
            SchemaSearchSingleRegistryDialog(REGISTRY1, projectRule.project, { }, mockSchemaSearchExecutor, mockSchemaViewer, Alarm.ThreadToUse.POOLED_THREAD)
        if (state == null) {
            dialog.initializeNew()
        } else {
            dialog.initializeFromState(state)
        }
        return dialog
    }

    private fun initAllRegistriesDialog(state: SchemaSearchAllRegistriesDialogState? = null): SchemaSearchAllRegistriesDialog {
        val dialog =
            SchemaSearchAllRegistriesDialog(projectRule.project, { }, mockSchemaSearchExecutor, mockSchemaViewer, Alarm.ThreadToUse.POOLED_THREAD)
        if (state == null) {
            dialog.initializeNew()
        } else {
            dialog.initializeFromState(state)
        }
        return dialog
    }

    private fun <T : SchemaSearchResultBase, U : SchemaSearchDialogState<T>> assertInitialDialogState(dialog: SchemasSearchDialogBase<T, U>) {
        assertThat(dialog).isNotNull

        assertThat(dialog.getDownloadButton()?.isEnabled).isFalse()
        assertThat(dialog.searchTextField.text).isEmpty()
        assertThat(dialog.resultsList.isEmpty).isTrue()
        assertThat(dialog.versionsCombo.isEditable).isFalse()
        assertThat(dialog.versionsCombo.isEnabled).isFalse()
        assertThat(dialog.previewText.isEditable).isFalse()
        assertThat(dialog.currentSearchErrors).isEmpty()
    }

    private fun <T : SchemaSearchResultBase, U : SchemaSearchDialogState<T>> assertSearchingDialogState(dialog: SchemasSearchDialogBase<T, U>) {
        assertThat(dialog.getDownloadButton()?.isEnabled).isFalse()
        assertThat(dialog.previewText.text.isEmpty()).isTrue()
        assertThat(dialog.resultsList.itemsCount).isEqualTo(0)
        assertThat(dialog.resultsList.emptyText.text).isEqualTo(message("schemas.search.searching"))
        assertThat(dialog.versionsCombo.itemCount).isEqualTo(0)
        assertThat(dialog.versionsCombo.isEnabled).isFalse()
        assertThat(dialog.currentSearchErrors).isEmpty()
    }

    private fun <T : SchemaSearchResultBase, U : SchemaSearchDialogState<T>> assertSearchResultsDialogState(
        dialog: SchemasSearchDialogBase<T, U>,
        expectedResults: Collection<T>,
        searchErrors: Collection<SchemaSearchError>
    ) {
        assertThat(dialog.getDownloadButton()?.isEnabled).isFalse()
        assertThat(dialog.previewText.text.isEmpty()).isTrue()
        assertThat(dialog.resultsList.emptyText.text).isEqualTo(message("schemas.search.no_results"))
        assertThat(dialog.resultsModel.elements().toList()).containsOnlyElementsOf(expectedResults)
        assertThat(dialog.versionsCombo.itemCount).isEqualTo(0)
        assertThat(dialog.versionsCombo.isEnabled).isFalse()
        assertThat(dialog.currentSearchErrors).containsOnlyElementsOf(searchErrors)
    }

    private fun <T : SchemaSearchResultBase, U : SchemaSearchDialogState<T>> assertSearchResultSelectedDialogState(
        dialog: SchemasSearchDialogBase<T, U>,
        schemaContents: String,
        versions: Collection<SchemaSearchResultVersion>,
        selectedVersion: SchemaSearchResultVersion
    ) {
        assertThat(dialog.getDownloadButton()?.isEnabled).isTrue()
        assertThat(dialog.previewText.text).isEqualTo(schemaContents)
        assertThat(dialog.versionsCombo.itemCount).isEqualTo(VERSIONS.size)
        assertThat(dialog.versionsCombo.isEnabled).isTrue()
        assertThat(dialog.versionsModel.size).isEqualTo(versions.size)
        // JComboBox and ComboBox model both don't expose a property of all elements
        versions.forEach { version -> assertThat(dialog.versionsModel.getIndexOf(version)).isGreaterThanOrEqualTo(0) }
        assertThat(dialog.versionsCombo.selectedItem).isEqualTo(selectedVersion)

        assertThat(dialog.previewText.highlighter.highlights).isNotEmpty
        assertThat(dialog.previewText.caretPosition).isGreaterThan(0)
    }

    fun <T> completableFutureOf(obj: T): CompletableFuture<T> {
        val future = CompletableFuture<T>()
        future.complete(obj)
        return future
    }
}
