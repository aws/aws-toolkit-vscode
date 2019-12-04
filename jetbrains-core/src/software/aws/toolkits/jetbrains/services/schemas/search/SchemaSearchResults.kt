// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

import software.aws.toolkits.resources.message

typealias OnSearchResultReturned<T> = (List<T>) -> Unit

typealias OnSearchResultError = (SchemaSearchError) -> Unit

interface SchemaSearchResultBase {
    val name: String
    val versions: List<String>

    override fun toString(): String
}

data class SchemaSearchResult(
    override val name: String,
    override val versions: List<String>
) : SchemaSearchResultBase {
    override fun toString() = name
}

data class SchemaSearchResultWithRegistry(
    override val name: String,
    override val versions: List<String>,
    val registry: String
) : SchemaSearchResultBase {
    override fun toString() = "$registry/$name"
}

data class SchemaSearchResultVersion(val version: String) {
    override fun toString() = PREFIX + version

    companion object {
        private val PREFIX = message("schemas.search.version.prefix")
    }
}

data class SchemaSearchError(val registryName: String, val errorMessage: String)
