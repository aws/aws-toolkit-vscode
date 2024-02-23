// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.gateway

import software.amazon.awssdk.services.codecatalyst.model.ListSourceRepositoriesItem

data class SourceRepository(
    val name: String
)

fun ListSourceRepositoriesItem.toSourceRepository() = SourceRepository(
    name = this.name()
)

data class BranchSummary(
    val name: String,
    val headCommitId: String
)
