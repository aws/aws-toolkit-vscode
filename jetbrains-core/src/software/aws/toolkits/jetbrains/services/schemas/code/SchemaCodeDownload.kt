// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code

import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.services.schemas.SchemaSummary
import java.nio.ByteBuffer

data class SchemaCodeDownloadRequestDetails(
    val schema: SchemaSummary,
    val version: String,
    val language: SchemaCodeLangs,
    val destinationDirectory: String
) {
    // TODO: This is far from reliable, and won't work if the schema has special characters,
    //  and should either be generated using SchemaCodeGenUtils or provided from the server via metadata in DescribeCodeBindings
    fun schemaCoreCodeFileName(): String = "${schema.title()}.${language.extension}"
}

data class DownloadedSchemaCode(
    val zipContents: ByteBuffer
)
