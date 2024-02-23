// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.ide.scratch.ScratchFileService
import com.intellij.ide.scratch.ScratchRootType
import com.intellij.json.JsonLanguage
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.io.FileUtil
import com.intellij.util.ExceptionUtil
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.SchemasTelemetry
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import kotlin.math.min

class SchemaViewer(
    private val project: Project,
    private val schemaDownloader: SchemaDownloader = SchemaDownloader(),
    private val schemaFormatter: SchemaFormatter = SchemaFormatter(),
    private val schemaPreviewer: SchemaPreviewer = SchemaPreviewer()
) {
    fun downloadAndViewSchema(schemaName: String, registryName: String, connectionSettings: ConnectionSettings): CompletionStage<Void> =
        schemaDownloader.getSchemaContent(registryName, schemaName, connectionSettings = connectionSettings)
            .thenCompose { schemaContent ->
                SchemasTelemetry.download(project, success = true)
                schemaFormatter.prettySchemaContent(schemaContent.content())
                    .thenCompose { prettySchemaContent ->
                        schemaPreviewer.openFileInEditor(
                            registryName,
                            schemaName,
                            prettySchemaContent,
                            schemaContent.schemaVersion(),
                            project,
                            connectionSettings
                        )
                    }
            }
            .exceptionally { error ->
                notifyError(message("schemas.schema.could_not_open", schemaName), ExceptionUtil.getThrowableText(error), project)
                SchemasTelemetry.download(project, success = false)
                null
            }

    fun downloadPrettySchema(
        schemaName: String,
        registryName: String,
        version: String?,
        connectionSettings: ConnectionSettings
    ): CompletionStage<String> = schemaDownloader.getSchemaContent(registryName, schemaName, version, connectionSettings)
        .thenCompose { schemaContent ->
            schemaFormatter.prettySchemaContent(schemaContent.content())
        }
        .exceptionally { error ->
            notifyError(message("schemas.schema.could_not_open", schemaName), ExceptionUtil.getThrowableText(error), project)
            null
        }
}

class SchemaDownloader {
    fun getSchemaContent(
        registryName: String,
        schemaName: String,
        version: String? = null,
        connectionSettings: ConnectionSettings
    ): CompletionStage<DescribeSchemaResponse> {
        val resource = SchemasResources.getSchema(registryName, schemaName, version)
        return AwsResourceCache.getInstance().getResource(resource, connectionSettings)
    }

    fun getSchemaContentAsJson(schemaContent: DescribeSchemaResponse): JsonNode = jacksonObjectMapper().readTree(schemaContent.content())
}

class SchemaFormatter {
    fun prettySchemaContent(rawSchemaContent: String): CompletionStage<String> {
        val future = CompletableFuture<String>()
        val mapper = jacksonObjectMapper()
        try {
            val json = mapper.readValue(rawSchemaContent, Any::class.java)
            val formatted = mapper.writerWithDefaultPrettyPrinter().writeValueAsString(json)

            future.complete(formatted)
        } catch (e: Exception) {
            future.completeExceptionally(e)
        }
        return future
    }
}

class SchemaPreviewer {
    fun openFileInEditor(
        registryName: String,
        schemaName: String,
        schemaContent: String,
        version: String,
        project: Project,
        connectionSettings: ConnectionSettings
    ): CompletionStage<Void> {
        val credentialIdentifier = connectionSettings.credentials.id
        val region = connectionSettings.region.id

        val fileName = "${credentialIdentifier}_${region}_${registryName}_${schemaName}_$version"
        val sanitizedFileName = FileUtil.sanitizeFileName(fileName, false)
        val trimmedFileNameWithExtension = sanitizedFileName.substring(0, min(sanitizedFileName.length, MAX_FILE_LENGTH)) + SCHEMA_EXTENSION

        val future = CompletableFuture<Void>()

        ApplicationManager.getApplication().invokeLater {
            try {
                val vfile = ScratchRootType.getInstance()
                    .createScratchFile(project, trimmedFileNameWithExtension, JsonLanguage.INSTANCE, schemaContent, ScratchFileService.Option.create_if_missing)

                vfile?.let {
                    val fileEditorManager = FileEditorManager.getInstance(project)
                    fileEditorManager.openTextEditor(OpenFileDescriptor(project, it), true)
                        ?: throw RuntimeException(message("schemas.schema.could_not_open", schemaName))
                }
                future.complete(null)
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }

        return future
    }

    companion object {
        const val SCHEMA_EXTENSION = ".json"

        const val MAX_FILE_LENGTH = 255 - SCHEMA_EXTENSION.length // min(MAX_FILE_NAME_LENGTH_WINDOWS, MAX_FILE_NAME_LENGTH_MAC)
    }
}
