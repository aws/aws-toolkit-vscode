// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.commands

import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.TriggerType

enum class EditorContextCommand(
    val verb: String,
    val actionId: String,
    var triggerType: TriggerType = TriggerType.ContextMenu
) {
    Explain(
        verb = "Explain",
        actionId = "aws.amazonq.explainCode",
    ),
    Refactor(
        verb = "Refactor",
        actionId = "aws.amazonq.refactorCode",
    ),
    Fix(
        verb = "Fix",
        actionId = "aws.amazonq.fixCode",
    ),
    Optimize(
        verb = "Optimize",
        actionId = "aws.amazonq.optimizeCode",
    ),
    SendToPrompt(
        verb = "SendToPrompt",
        actionId = "aws.amazonq.sendToPrompt",
    ),
}
