// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.editor.context

import software.aws.toolkits.jetbrains.services.cwc.editor.context.file.FileContext
import software.aws.toolkits.jetbrains.services.cwc.editor.context.focusArea.FocusAreaContext

data class ActiveFileContext(
    val fileContext: FileContext?,
    val focusAreaContext: FocusAreaContext?,
)
