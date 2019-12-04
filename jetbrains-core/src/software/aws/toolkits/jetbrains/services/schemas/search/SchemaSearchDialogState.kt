// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

class SchemaSearchSingleRegistyDialogState(
    searchText: String,
    searchResults: List<SchemaSearchResult>,
    selectedResult: SchemaSearchResult?,
    selectedVersion: String?
) :
    SchemaSearchDialogState<SchemaSearchResult>(searchText, searchResults, selectedResult, selectedVersion)

class SchemaSearchAllRegistriesDialogState(
    searchText: String,
    searchResults: List<SchemaSearchResultWithRegistry>,
    selectedResult: SchemaSearchResultWithRegistry?,
    selectedVersion: String?
) :
    SchemaSearchDialogState<SchemaSearchResultWithRegistry>(searchText, searchResults, selectedResult, selectedVersion)

open class SchemaSearchDialogState<T : SchemaSearchResultBase>(
    val searchText: String,
    val searchResults: List<T>,
    val selectedResult: T?,
    val selectedVersion: String?
)
