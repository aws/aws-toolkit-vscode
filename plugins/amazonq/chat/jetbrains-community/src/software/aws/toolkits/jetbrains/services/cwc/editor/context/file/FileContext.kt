// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.file

import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.MatchPolicy

data class FileContext(
    val fileLanguage: String?,
    val filePath: String?,
    val matchPolicy: MatchPolicy?,
)
