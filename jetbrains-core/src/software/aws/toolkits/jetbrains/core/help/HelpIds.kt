// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.help

enum class HelpIds(shortId: String, val url: String) {
    EXPLORER_WINDOW("explorerWindow", "https://docs.aws.amazon.com/console/toolkit-for-jetbrains/aws-explorer");

    val id = "aws.toolkit.$shortId"
}