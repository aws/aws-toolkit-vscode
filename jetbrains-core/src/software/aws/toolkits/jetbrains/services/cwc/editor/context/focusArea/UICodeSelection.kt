// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context.focusArea

data class UICodeSelection(
    val selectedCode: String = "",
    val file: UICodeSelectionFile,
)

data class UICodeSelectionRange(val start: UICodeSelectionLineRange, val end: UICodeSelectionLineRange)
data class UICodeSelectionLineRange(val row: Int, val column: Int)

data class UICodeSelectionFile(val name: String, val range: UICodeSelectionRange)
