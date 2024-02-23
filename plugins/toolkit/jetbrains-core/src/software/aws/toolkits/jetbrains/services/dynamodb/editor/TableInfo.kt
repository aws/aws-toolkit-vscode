// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import software.aws.toolkits.jetbrains.services.dynamodb.Index

data class TableInfo(val tableName: String, val tableIndex: Index, val localSecondary: List<Index>, val globalSecondary: List<Index>)
