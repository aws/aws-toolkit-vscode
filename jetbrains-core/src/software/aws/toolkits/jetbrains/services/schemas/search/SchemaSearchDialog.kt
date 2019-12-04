// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

import com.intellij.openapi.project.Project
import com.intellij.util.Alarm
import software.aws.toolkits.jetbrains.services.schemas.SchemaViewer
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletionStage
import java.util.stream.IntStream
import kotlin.streams.toList

interface SchemaSearchDialog<T : SchemaSearchResultBase, U : SchemaSearchDialogState<T>> {
    fun initializeNew()
    fun initializeFromState(state: U)
}

class SchemaSearchSingleRegistryDialog(
    private val registryName: String,
    project: Project,
    onCancelCallback: (SchemaSearchSingleRegistyDialogState) -> Unit,
    private val searchExecutor: SchemaSearchExecutor = SchemaSearchExecutor(project),
    schemaViewer: SchemaViewer = SchemaViewer(project),
    alarmThreadToUse: Alarm.ThreadToUse = Alarm.ThreadToUse.SWING_THREAD
) :
    SchemasSearchDialogBase<SchemaSearchResult, SchemaSearchSingleRegistyDialogState>(
        project,
        schemaViewer,
        message("schemas.search.header.text.singleRegistry", registryName),
        onCancelCallback,
        alarmThreadToUse
    ) {

    override fun getCurrentState(): SchemaSearchSingleRegistyDialogState {
        val searchResults = IntStream.range(0, resultsModel.size()).mapToObj(resultsModel::get).toList()
        return SchemaSearchSingleRegistyDialogState(currentSearchText(), searchResults, selectedSchema(), selectedSchemaVersion()?.version)
    }

    override fun selectedSchemaRegistry() = registryName

    override fun downloadSchemaContent(schema: SchemaSearchResult, version: String): CompletionStage<String> =
        doDownloadSchemaContent(registryName, schema.name, version)

    override fun searchSchemas(
        searchText: String,
        incrementalResultsCallback: OnSearchResultReturned<SchemaSearchResult>,
        registrySearchErrorCallback: OnSearchResultError
    ) {
        emitTelemetry("SearchSingleRegistry")
        searchExecutor.searchSchemasInRegistry(registryName, searchText, incrementalResultsCallback, registrySearchErrorCallback)
    }
}

class SchemaSearchAllRegistriesDialog(
    project: Project,
    onCancelCallback: (SchemaSearchAllRegistriesDialogState) -> Unit,
    private val searchExecutor: SchemaSearchExecutor = SchemaSearchExecutor(project),
    schemaViewer: SchemaViewer = SchemaViewer(project),
    alarmThreadToUse: Alarm.ThreadToUse = Alarm.ThreadToUse.SWING_THREAD
) :
    SchemasSearchDialogBase<SchemaSearchResultWithRegistry, SchemaSearchAllRegistriesDialogState>(
        project,
        schemaViewer,
        message("schemas.search.header.text.allRegistries"),
        onCancelCallback,
        alarmThreadToUse
    ) {

    override fun getCurrentState(): SchemaSearchAllRegistriesDialogState {
        val searchResults = IntStream.range(0, resultsModel.size()).mapToObj(resultsModel::get).toList()
        return SchemaSearchAllRegistriesDialogState(currentSearchText(), searchResults, selectedSchema(), selectedSchemaVersion()?.version)
    }

    override fun selectedSchemaRegistry() = selectedSchema()?.registry

    override fun downloadSchemaContent(schema: SchemaSearchResultWithRegistry, version: String): CompletionStage<String> =
        doDownloadSchemaContent(schema.registry, schema.name, version)

    override fun searchSchemas(
        searchText: String,
        incrementalResultsCallback: OnSearchResultReturned<SchemaSearchResultWithRegistry>,
        registrySearchErrorCallback: OnSearchResultError
    ) {
        emitTelemetry("SearchAllRegistries")
        searchExecutor.searchSchemasAcrossAllRegistries(searchText, incrementalResultsCallback, registrySearchErrorCallback)
    }
}
