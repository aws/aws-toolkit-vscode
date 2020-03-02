// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.eq
import com.nhaarman.mockitokotlin2.mock
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.services.schemas.SchemaViewer
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture.completedFuture
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class SchemaSearchDialogTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    private val mockSchemaSearchExecutor = mock<SchemaSearchExecutor>()
    private val mockSchemaViewer = mock<SchemaViewer>()

    @Test
    fun initializeSearchRegistryDialog() {
        val dialog = runInEdtAndGet {
            initSingleRegistryDialog()
        }

        assertInitialDialogState(dialog)
    }

    @Test
    fun initializeSearchAllRegistriesDialog() {
        val dialog = runInEdtAndGet {
            initAllRegistriesDialog()
        }

        assertInitialDialogState(dialog)
    }

    @Test
    fun initializeSearchRegistryDialogFromState() {
        val result1 = SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1)
        val result2 = SchemaSearchResultWithRegistry(SCHEMA2, VERSIONS, REGISTRY1)
        val searchResults = listOf(result1, result2)

        val latch = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasInRegistry(eq(REGISTRY1), eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                it.getArgument<OnSearchResultReturned>(2).invoke(searchResults)
                latch.countDown()
            }
        }

        mockSchemaViewer.stub {
            on { downloadPrettySchema(eq(SCHEMA2), eq(REGISTRY1), any(), any()) }.thenReturn(completedFuture(SCHEMA2_CONTENTS))
        }

        val dialog = runInEdtAndGet {
            initSingleRegistryDialog(SchemaSearchDialogState(SEARCH_CRITERIA, searchResults, result2, LAST_VERSION))
        }

        latch.wait()

        assertSearchResultSelectedDialogState(
            dialog,
            SCHEMA2_CONTENTS,
            VERSIONS,
            LAST_VERSION
        )
    }

    @Test
    fun initializeSearchAllRegistriesDialogFromState() {
        val result1 = SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1)
        val result2 = SchemaSearchResultWithRegistry(SCHEMA2, VERSIONS, REGISTRY2)
        val searchResults = listOf(result1, result2)

        val latch = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasAcrossAllRegistries(eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                it.getArgument<OnSearchResultReturned>(2).invoke(searchResults)
                latch.countDown()
            }
        }

        mockSchemaViewer.stub {
            on { downloadPrettySchema(eq(SCHEMA2), eq(REGISTRY2), any(), any()) }.thenReturn(completedFuture(SCHEMA2_CONTENTS))
        }

        val dialog = runInEdtAndGet {
            initAllRegistriesDialog(SchemaSearchDialogState(SEARCH_CRITERIA, searchResults, result2, LAST_VERSION))
        }

        latch.wait()

        assertSearchResultSelectedDialogState(
            dialog,
            SCHEMA2_CONTENTS,
            VERSIONS,
            LAST_VERSION
        )
    }

    @Test
    fun singleRegistrySearchInProgress() {
        val searchingLatch = CountDownLatch(1)
        val waitForAsserts = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasInRegistry(eq(REGISTRY1), eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                searchingLatch.countDown()

                // Make this take a long time, so that we can assert the intermediate state

                waitForAsserts.await()
            }
        }

        val dialog = runInEdtAndGet {
            initSingleRegistryDialog().also {
                it.searchTextField.text = SEARCH_CRITERIA
            }
        }

        searchingLatch.wait()

        try {
            assertSearchingDialogState(dialog)
        } finally {
            waitForAsserts.countDown()
        }
    }

    @Test
    fun allRegistriesSearchInProgress() {
        val searchingLatch = CountDownLatch(1)
        val waitForAsserts = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasAcrossAllRegistries(eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                searchingLatch.countDown()

                // Make this take a long time, so that we can assert the intermediate state

                waitForAsserts.await()
            }
        }

        val dialog = runInEdtAndGet {
            initAllRegistriesDialog().also {
                it.searchTextField.text = SEARCH_CRITERIA
            }
        }

        searchingLatch.wait()

        try {
            assertSearchingDialogState(dialog)
        } finally {
            waitForAsserts.countDown()
        }
    }

    @Test
    fun singleRegistrySearchWithResults() {
        val searchResults = listOf(SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1))

        val latch = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasInRegistry(eq(REGISTRY1), eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                it.getArgument<OnSearchResultReturned>(2).invoke(searchResults)
                latch.countDown()
            }
        }

        val dialog = runInEdtAndGet {
            initSingleRegistryDialog().also {
                it.searchTextField.text = SEARCH_CRITERIA
            }
        }

        latch.wait()

        assertSearchResultsDialogState(dialog, searchResults, emptyList())
    }

    @Test
    fun singleRegistrySearchError() {
        val searchError = SchemaSearchError(REGISTRY1, "someErrorMessage")

        val latch = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasInRegistry(eq(REGISTRY1), eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                it.getArgument<OnSearchResultError>(3).invoke(searchError)
                latch.countDown()
            }
        }

        val dialog = runInEdtAndGet {
            initSingleRegistryDialog().also {
                it.searchTextField.text = SEARCH_CRITERIA
            }
        }

        latch.wait()

        assertSearchResultsDialogState(dialog, emptyList(), listOf(searchError))
    }

    @Test
    fun allRegistriesSearchWithResults() {
        val searchResultsPart1 = listOf(SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1))
        val searchResultsPart2 = listOf(SchemaSearchResultWithRegistry(SCHEMA2, VERSIONS, REGISTRY2))

        val latch = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasAcrossAllRegistries(eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                it.getArgument<OnSearchResultReturned>(1).invoke(searchResultsPart1)
                it.getArgument<OnSearchResultReturned>(1).invoke(searchResultsPart2)
                latch.countDown()
            }
        }

        val dialog = runInEdtAndGet {
            initAllRegistriesDialog().also {
                it.searchTextField.text = SEARCH_CRITERIA
            }
        }

        latch.wait()

        assertSearchResultsDialogState(dialog, searchResultsPart1 + searchResultsPart2, emptyList())
    }

    @Test
    fun allRegistriesSearchError() {
        val searchResultsPart1 = listOf(SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1))
        val searchError = SchemaSearchError(REGISTRY1, "someErrorMessage")

        val latch = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasAcrossAllRegistries(eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                it.getArgument<OnSearchResultReturned>(1).invoke(searchResultsPart1)
                it.getArgument<OnSearchResultError>(2).invoke(searchError)
                latch.countDown()
            }
        }

        val dialog = runInEdtAndGet {
            initAllRegistriesDialog().also {
                it.searchTextField.text = SEARCH_CRITERIA
            }
        }

        latch.wait()

        assertSearchResultsDialogState(dialog, searchResultsPart1, listOf(searchError))
    }

    @Test
    fun singleRegistrySearchResultSelected() {
        val searchResults = listOf(SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1))

        val latch = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasInRegistry(eq(REGISTRY1), eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                it.getArgument<OnSearchResultReturned>(2).invoke(searchResults)
                latch.countDown()
            }
        }

        mockSchemaViewer.stub {
            on { downloadPrettySchema(eq(SCHEMA1), eq(REGISTRY1), any(), any()) }.thenReturn(completedFuture(SCHEMA1_CONTENTS))
        }

        val dialog = runInEdtAndGet {
            initSingleRegistryDialog().also {
                it.searchTextField.text = SEARCH_CRITERIA
            }
        }

        latch.wait()

        runInEdtAndWait {
            dialog.resultsList.selectedIndex = 0
        }

        assertSearchResultSelectedDialogState(
            dialog,
            SCHEMA1_CONTENTS,
            VERSIONS,
            FIRST_VERSION
        )
    }

    @Test
    fun allRegistriesSearchResultSelected() {
        val searchResults = listOf(
            SchemaSearchResultWithRegistry(SCHEMA1, VERSIONS, REGISTRY1),
            SchemaSearchResultWithRegistry(SCHEMA2, VERSIONS, REGISTRY2)
        )

        val latch = CountDownLatch(1)

        mockSchemaSearchExecutor.stub {
            on { searchSchemasAcrossAllRegistries(eq(SEARCH_CRITERIA), any(), any()) }.thenAnswer {
                it.getArgument<OnSearchResultReturned>(1).invoke(searchResults)
                latch.countDown()
            }
        }

        mockSchemaViewer.stub {
            on { downloadPrettySchema(eq(SCHEMA1), eq(REGISTRY1), any(), any()) }.thenReturn(completedFuture(SCHEMA1_CONTENTS))
        }

        val dialog = runInEdtAndGet {
            initAllRegistriesDialog().also {
                it.searchTextField.text = SEARCH_CRITERIA
            }
        }

        latch.wait()

        runInEdtAndWait {
            dialog.resultsList.selectedIndex = 0
        }

        assertSearchResultSelectedDialogState(
            dialog,
            SCHEMA1_CONTENTS,
            VERSIONS,
            FIRST_VERSION
        )
    }

    private fun initSingleRegistryDialog(state: SchemaSearchDialogState? = null): SchemaSearchSingleRegistryDialog {
        val dialog = SchemaSearchSingleRegistryDialog(
            REGISTRY1,
            projectRule.project,
            mockSchemaSearchExecutor,
            mockSchemaViewer,
            onCancelCallback = { }
        )

        if (state == null) {
            dialog.initializeNew()
        } else {
            dialog.initializeFromState(state)
        }

        return dialog
    }

    private fun initAllRegistriesDialog(state: SchemaSearchDialogState? = null): SchemaSearchAllRegistriesDialog {
        val dialog = SchemaSearchAllRegistriesDialog(
            projectRule.project,
            mockSchemaSearchExecutor,
            mockSchemaViewer,
            onCancelCallback = { }
        )

        if (state == null) {
            dialog.initializeNew()
        } else {
            dialog.initializeFromState(state)
        }

        return dialog
    }

    private fun assertInitialDialogState(dialog: SchemasSearchDialogBase) {
        assertThat(dialog.getDownloadButton()?.isEnabled).isFalse()
        assertThat(dialog.searchTextField.text).isEmpty()
        assertThat(dialog.resultsList.isEmpty).isTrue()
        assertThat(dialog.resultsList.emptyText.text).isEqualTo(message("schemas.search.no_results"))
        assertThat(dialog.versionsCombo.isEditable).isFalse()
        assertThat(dialog.versionsCombo.isEnabled).isFalse()
        assertThat(dialog.previewText.isEditable).isFalse()
        assertThat(dialog.currentSearchErrors).isEmpty()
    }

    private fun assertSearchingDialogState(dialog: SchemasSearchDialogBase) {
        assertThat(dialog.getDownloadButton()?.isEnabled).isFalse()
        assertThat(dialog.previewText.text.isEmpty()).isTrue()
        assertThat(dialog.resultsList.itemsCount).isEqualTo(0)
        assertThat(dialog.resultsList.emptyText.text).isEqualTo(message("schemas.search.searching"))
        assertThat(dialog.versionsCombo.itemCount).isEqualTo(0)
        assertThat(dialog.versionsCombo.isEnabled).isFalse()
        assertThat(dialog.currentSearchErrors).isEmpty()
    }

    private fun assertSearchResultsDialogState(
        dialog: SchemasSearchDialogBase,
        expectedResults: Collection<SchemaSearchResultWithRegistry>,
        searchErrors: Collection<SchemaSearchError>
    ) {
        assertThat(dialog.getDownloadButton()?.isEnabled).isFalse()
        assertThat(dialog.previewText.text.isEmpty()).isTrue()
        assertThat(dialog.resultsList.emptyText.text).isEqualTo(message("schemas.search.no_results"))
        assertThat(dialog.resultsModel.elements().toList()).hasSameElementsAs(expectedResults)
        assertThat(dialog.versionsCombo.itemCount).isEqualTo(0)
        assertThat(dialog.versionsCombo.isEnabled).isFalse()
        assertThat(dialog.currentSearchErrors).hasSameElementsAs(searchErrors)
    }

    private fun assertSearchResultSelectedDialogState(
        dialog: SchemasSearchDialogBase,
        schemaContents: String,
        versions: Collection<String>,
        selectedVersion: String
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

    private fun CountDownLatch.wait() {
        this.await(3, TimeUnit.SECONDS)
    }

    private companion object {
        const val REGISTRY1 = "Registry1"
        const val REGISTRY2 = "Registry2"
        const val SCHEMA1 = "Schema1"
        const val SCHEMA1_CONTENTS = "Schema1_contents"
        const val SCHEMA2 = "Schema2"
        const val SCHEMA2_CONTENTS = "Schema2_contents"
        const val FIRST_VERSION = "3"
        const val LAST_VERSION = "1"
        val VERSIONS = listOf(FIRST_VERSION, "2", LAST_VERSION)
        const val SEARCH_CRITERIA = "contents"
    }
}
