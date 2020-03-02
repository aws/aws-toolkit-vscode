// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.search

data class SchemaSearchDialogState(
    val searchText: String,
    val searchResults: List<SchemaSearchResultWithRegistry>,
    val selectedResult: SchemaSearchResultWithRegistry?,
    val selectedVersion: String?
)
