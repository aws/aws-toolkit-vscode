// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry

import com.intellij.openapi.editor.RangeMarker
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.services.codewhisperer.telemetry.UserModificationTrackingEntry
import java.time.Instant

data class InsertedCodeModificationEntry(
    val conversationId: String,
    val messageId: String,
    override val time: Instant,
    val vFile: VirtualFile?,
    val range: RangeMarker,
    val originalString: String
) : UserModificationTrackingEntry
