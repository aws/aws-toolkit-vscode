// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.focusArea

import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.CodeNames

data class FocusAreaContext(
    val codeSelection: String?,
    val codeSelectionRange: UICodeSelectionRange?,
    val trimmedSurroundingFileText: String?,
    val codeNames: CodeNames?,
)
