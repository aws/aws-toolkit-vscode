// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBLabel
import software.aws.toolkits.jetbrains.services.schemas.SchemaViewer
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.SchemasTelemetry
import javax.swing.JComponent

interface SchemaSearchDialog {
    fun initializeNew()
    fun initializeFromState(state: SchemaSearchDialogState)
}

class SchemaSearchSingleRegistryDialog(
    private val registryName: String,
    project: Project,
    private val searchExecutor: SchemaSearchExecutor = SchemaSearchExecutor(project),
    schemaViewer: SchemaViewer = SchemaViewer(project),
    onCancelCallback: (SchemaSearchDialogState) -> Unit
) : SchemasSearchDialogBase(
    project,
    schemaViewer,
    message("schemas.search.header.text.singleRegistry", registryName),
    onCancelCallback
) {

    override fun createResultRenderer(): (SchemaSearchResultWithRegistry) -> JComponent = {
        JBLabel(it.name)
    }

    override fun searchSchemas(
        searchText: String,
        incrementalResultsCallback: OnSearchResultReturned,
        registrySearchErrorCallback: OnSearchResultError
    ) {
        SchemasTelemetry.search(project, Result.SUCCEEDED)
        searchExecutor.searchSchemasInRegistry(registryName, searchText, incrementalResultsCallback, registrySearchErrorCallback)
    }
}

class SchemaSearchAllRegistriesDialog(
    project: Project,
    private val searchExecutor: SchemaSearchExecutor = SchemaSearchExecutor(project),
    schemaViewer: SchemaViewer = SchemaViewer(project),
    onCancelCallback: (SchemaSearchDialogState) -> Unit
) : SchemasSearchDialogBase(
        project,
        schemaViewer,
        message("schemas.search.header.text.allRegistries"),
        onCancelCallback
    ) {

    override fun createResultRenderer(): (SchemaSearchResultWithRegistry) -> JComponent = {
        JBLabel("${it.registry}/${it.name}")
    }

    override fun searchSchemas(
        searchText: String,
        incrementalResultsCallback: OnSearchResultReturned,
        registrySearchErrorCallback: OnSearchResultError
    ) {
        SchemasTelemetry.search(project, Result.SUCCEEDED)
        searchExecutor.searchSchemasAcrossAllRegistries(searchText, incrementalResultsCallback, registrySearchErrorCallback)
    }
}
