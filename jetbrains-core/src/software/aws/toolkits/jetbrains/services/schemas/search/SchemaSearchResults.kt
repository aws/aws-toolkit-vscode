// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

typealias OnSearchResultReturned = (List<SchemaSearchResultWithRegistry>) -> Unit

typealias OnSearchResultError = (SchemaSearchError) -> Unit

data class SchemaSearchResultWithRegistry(
    val name: String,
    val versions: List<String>,
    val registry: String
)

data class SchemaSearchResultVersion(val version: String)

data class SchemaSearchError(val registryName: String, val errorMessage: String)
