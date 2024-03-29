// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat.prompts

class PromptsGenerator {
    public fun getPromptForCommandVerb(commandVerb: String, selectedCode: String): String {
        val trimSelectedCode = selectedCode.trimStart().trimEnd()
        return "$commandVerb the following part of my code to me: $trimSelectedCode"
    }
}
