// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.jetbrains.jsonSchema.extension.JsonSchemaFileProvider
import com.jetbrains.jsonSchema.extension.JsonSchemaProviderFactory
import com.jetbrains.jsonSchema.extension.SchemaType
import com.jetbrains.jsonSchema.impl.JsonSchemaVersion
import software.aws.toolkits.jetbrains.core.getResourceNow

class ResourceSchemaProviderFactory : JsonSchemaProviderFactory {
    override fun getProviders(project: Project): List<JsonSchemaFileProvider> {
        val schemaProviders = mutableListOf<JsonSchemaFileProvider>()
        DynamicResourceSchemaMapping.getInstance().getCurrentlyActiveResourceTypes().forEach {
            val schemaFile = object : JsonSchemaFileProvider {
                override fun isAvailable(file: VirtualFile): Boolean =
                    file is DynamicResourceVirtualFile && file.dynamicResourceType == it && file.isWritable

                override fun getName(): String = "$it schema"

                override fun getSchemaFile(): VirtualFile? = project.getResourceNow(CloudControlApiResources.getResourceSchema(it))

                override fun getSchemaVersion(): JsonSchemaVersion = JsonSchemaVersion.SCHEMA_7

                override fun getSchemaType(): SchemaType = SchemaType.embeddedSchema
            }
            schemaProviders.add(schemaFile)
        }
        return schemaProviders
    }
}
