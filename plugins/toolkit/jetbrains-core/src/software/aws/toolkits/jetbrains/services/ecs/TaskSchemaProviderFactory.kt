// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.ecs

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.jsonSchema.extension.JsonSchemaFileProvider
import com.jetbrains.jsonSchema.extension.JsonSchemaProviderFactory
import com.jetbrains.jsonSchema.extension.SchemaType
import com.jetbrains.jsonSchema.impl.JsonSchemaVersion
import com.jetbrains.jsonSchema.remote.JsonFileResolver
import software.aws.toolkits.resources.message

class TaskSchemaProviderFactory : JsonSchemaProviderFactory {
    override fun getProviders(project: Project): List<JsonSchemaFileProvider> = listOf(
        object : JsonSchemaFileProvider {
            override fun getName(): String = message("ecs.task_definition.json_schema_name")

            override fun isAvailable(file: VirtualFile): Boolean = file.name.endsWith("ecs-task-def.json")

            override fun getSchemaFile(): VirtualFile? = JsonFileResolver.urlToFile(SCHEMA_URL)

            override fun getSchemaType(): SchemaType = SchemaType.remoteSchema

            override fun getSchemaVersion(): JsonSchemaVersion = JsonSchemaVersion.SCHEMA_7
        }
    )

    private companion object {
        const val SCHEMA_URL = "https://ecs-intellisense.s3-us-west-2.amazonaws.com/task-definition/schema.json"
    }
}
