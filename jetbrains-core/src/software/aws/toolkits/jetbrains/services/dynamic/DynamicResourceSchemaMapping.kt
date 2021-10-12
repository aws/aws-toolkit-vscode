// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.jetbrains.jsonSchema.JsonSchemaMappingsProjectConfiguration
import com.jetbrains.jsonSchema.ide.JsonSchemaService
import org.jetbrains.annotations.TestOnly

class DynamicResourceSchemaMapping {
    private val currentlyActiveResourceTypes: MutableSet<String> = mutableSetOf()

    fun addResourceSchemaMapping(
        project: Project,
        file: DynamicResourceVirtualFile
    ) {
        val configuration = JsonSchemaMappingsProjectConfiguration.getInstance(project).findMappingForFile(file)
        if (configuration == null) {
            currentlyActiveResourceTypes.add(file.dynamicResourceType)
            JsonSchemaService.Impl.get(project).reset()
        }
    }

    fun getCurrentlyActiveResourceTypes(): Set<String> = currentlyActiveResourceTypes

    @TestOnly
    fun removeCurrentlyActiveResourceTypes(project: Project) {
        currentlyActiveResourceTypes.clear()
        JsonSchemaService.Impl.get(project).reset()
    }

    companion object {
        fun getInstance(): DynamicResourceSchemaMapping = service()
    }
}
