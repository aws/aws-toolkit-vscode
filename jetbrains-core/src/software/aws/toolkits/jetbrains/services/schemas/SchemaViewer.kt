// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.intellij.ide.scratch.ScratchFileService
import com.intellij.ide.scratch.ScratchRootType
import com.intellij.json.JsonLanguage
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.util.ExceptionUtil
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.activeCredentialProvider
import software.aws.toolkits.jetbrains.core.credentials.activeRegion
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import javax.swing.JComponent

class SchemaViewer(
    private val project: Project,
    private val schemaDownloader: SchemaDownloader = SchemaDownloader(),
    private val schemaFormatter: SchemaFormatter = SchemaFormatter(),
    private val schemaPreviewer: SchemaPreviewer = SchemaPreviewer()
) {
    public fun downloadAndViewSchema(
        schemaName: String,
        registryName: String
    ): CompletionStage<Void> =
            schemaDownloader.getSchemaContent(registryName, schemaName, project = project)
                .thenCompose { schemaContent ->
                    schemaFormatter.prettySchemaContent(schemaContent.content())
                        .thenCompose { prettySchemaContent ->
                            schemaPreviewer.openFileInEditor(
                                registryName,
                                schemaName,
                                prettySchemaContent,
                                schemaContent.schemaVersion(),
                                project
                            )
                        }
                }
                .exceptionally { error ->
                    notifyError(message("schemas.schema.could_not_open", schemaName), ExceptionUtil.getThrowableText(error), project)
                    null
                }

    public fun downloadPrettySchema(
        schemaName: String,
        registryName: String,
        version: String?,
        component: JComponent
    ): CompletionStage<String> =
            schemaDownloader.getSchemaContent(registryName, schemaName, version, project)
                .thenCompose { schemaContent ->
                    schemaFormatter.prettySchemaContent(schemaContent.content(), component)
                }
                .exceptionally { error ->
                    notifyError(message("schemas.schema.could_not_open", schemaName), ExceptionUtil.getThrowableText(error), project)
                    null
                }
}

class SchemaDownloader() {
    fun getSchemaContent(registryName: String, schemaName: String, version: String? = null, project: Project): CompletionStage<DescribeSchemaResponse> {
        val resource = SchemasResources.getSchema(registryName, schemaName, version)
        return AwsResourceCache.getInstance(project).getResource(resource)
    }

    fun getSchemaContentAsJson(registryName: String, schemaName: String, project: Project): JsonNode {
        val schemaContent = getSchemaContent(registryName, schemaName, project = project).toCompletableFuture().get()
        return getSchemaContentAsJson(schemaContent)
    }

    fun getSchemaContentAsJson(schemaContent: DescribeSchemaResponse): JsonNode =
        mapper.readTree(schemaContent.content())

    companion object {
        val mapper = ObjectMapper()
    }
}

class SchemaFormatter() {
    fun prettySchemaContent(rawSchemaContent: String, component: JComponent? = null): CompletionStage<String> {
        val future = CompletableFuture<String>()
        runInEdt(if (component == null) ModalityState.any() else ModalityState.stateForComponent(component)) {
            try {
                // TODO: This should work. It doesn't. Switching to Jackson instead
//                val formatted = formatText(project, JsonLanguage.INSTANCE, rawSchemaContent)

                val json = mapper.readValue(rawSchemaContent, Any::class.java)
                val formatted = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(json)

                future.complete(formatted)
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }
        return future
    }

    companion object {
        val mapper = ObjectMapper()
    }
}

class SchemaPreviewer() {
    fun openFileInEditor(
        registryName: String,
        schemaName: String,
        schemaContent: String,
        version: String,
        project: Project
    ): CompletionStage<Void> {
        val credentialIdentifier = project.activeCredentialProvider().displayName
        val region = project.activeRegion().id

        val fileName = "$credentialIdentifier.$region.$registryName.$schemaName.$version.json"

        val future = CompletableFuture<Void>()

        ApplicationManager.getApplication().invokeLater({
            try {
                val vfile = ScratchRootType.getInstance()
                    .createScratchFile(project, fileName, JsonLanguage.INSTANCE, schemaContent, ScratchFileService.Option.create_if_missing)

                vfile?.let {
                    val fileEditorManager = FileEditorManager.getInstance(project)
                        fileEditorManager.openTextEditor(OpenFileDescriptor(project, it), true)
                            ?: throw RuntimeException(message("schemas.schema.could_not_open", schemaName))
                }
                future.complete(null)
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        })

        return future
    }
}
