// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.resources

import software.amazon.awssdk.services.schemas.SchemasClient
import software.amazon.awssdk.services.schemas.model.DescribeSchemaResponse
import software.amazon.awssdk.services.schemas.model.RegistrySummary
import software.amazon.awssdk.services.schemas.model.SchemaSummary
import software.amazon.awssdk.services.schemas.model.SchemaVersionSummary
import software.aws.toolkits.jetbrains.core.ClientBackedCachedResource
import software.aws.toolkits.jetbrains.core.Resource
import software.aws.toolkits.jetbrains.ui.wizard.SchemaSelectionItem
import java.time.Duration
import kotlin.streams.toList

object SchemasResources {
    @JvmField
    val AWS_EVENTS_REGISTRY = "aws.events"

    @JvmField
    val LIST_REGISTRIES: Resource.Cached<List<RegistrySummary>> =
        ClientBackedCachedResource(SchemasClient::class, "schemas.list_registries") {
            listRegistriesPaginator { it.build() }
                .registries()
                .sortedBy { it.registryName() }
                .toList()
        }

    @JvmField
    val LIST_REGISTRIES_AND_SCHEMAS: Resource.Cached<List<SchemaSelectionItem>> =
        ClientBackedCachedResource(SchemasClient::class, "schemas.list_registries_and_schemas") {
            listRegistriesPaginator { it.build() }
                .registries()
                .sortedBy { it.registryName() }
                .map { registrySummary ->
                    val registryName = registrySummary.registryName()
                    val schemas = listSchemasPaginator { it.registryName(registryName).build() }
                        .schemas()
                        .sortedBy { it.schemaName() }
                        .toList()

                    val schemaSelectionItems = ArrayList<SchemaSelectionItem>()
                    schemaSelectionItems.add(SchemaSelectionItem.RegistryItem(registryName))
                    schemas.forEach() { schemaSelectionItems.add(SchemaSelectionItem.SchemaItem(it.schemaName(), registryName)) }

                    schemaSelectionItems
                }
                .flatMap { it.toList() }
        }

    fun listSchemas(registryName: String): Resource.Cached<List<SchemaSummary>> =
        ClientBackedCachedResource(SchemasClient::class, "schemas.list_schemas.$registryName") {
            listSchemasPaginator { it.registryName(registryName).build() }
                .schemas()
                .sortedBy { it.schemaName() }
                .toList()
        }

    fun getSchema(registryName: String, schemaName: String, version: String? = null): Resource.Cached<DescribeSchemaResponse> =
        ClientBackedCachedResource(SchemasClient::class, "schemas.get_schema.$registryName.$schemaName") {
            describeSchema {
                it.registryName(registryName)
                    .schemaName(schemaName)
                    .schemaVersion(version)
                    .build()
            }
        }

    fun getSchemaVersions(registryName: String, schemaName: String): Resource.Cached<List<SchemaVersionSummary>> =
        ClientBackedCachedResource(SchemasClient::class, "schemas.list_schema_versions.$registryName.$schemaName", Duration.ofSeconds(10)) {
            listSchemaVersionsPaginator {
                it.registryName(registryName)
                    .schemaName(schemaName)
                    .build()
            }
                .schemaVersions()
                .toList()
        }
}
