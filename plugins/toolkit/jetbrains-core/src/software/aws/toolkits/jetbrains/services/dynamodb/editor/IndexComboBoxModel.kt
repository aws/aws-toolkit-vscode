// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamodb.editor

import com.intellij.ui.CollectionComboBoxModel
import software.aws.toolkits.jetbrains.services.dynamodb.Index
import software.aws.toolkits.resources.message

class IndexComboBoxModel(indexes: TableInfo) : CollectionComboBoxModel<Index>() {
    val separatorNames: Map<Int, String>

    init {
        val builtGroupings = buildGroupings(indexes)

        replaceAll(builtGroupings.first)
        separatorNames = builtGroupings.second
    }

    private fun buildGroupings(tableInfo: TableInfo): Pair<List<Index>, Map<Int, String>> {
        val groupIndexes = mutableMapOf<Int, String>()
        val groups = buildList<Index> {
            // We dont put a header on the primary table index
            add(tableInfo.tableIndex)

            if (tableInfo.localSecondary.isNotEmpty()) {
                groupIndexes[size] = message("dynamodb.viewer.search.index.local")
                addAll(tableInfo.localSecondary)
            }

            if (tableInfo.globalSecondary.isNotEmpty()) {
                groupIndexes[size] = message("dynamodb.viewer.search.index.global")
                addAll(tableInfo.globalSecondary)
            }
        }

        return groups to groupIndexes
    }
}
