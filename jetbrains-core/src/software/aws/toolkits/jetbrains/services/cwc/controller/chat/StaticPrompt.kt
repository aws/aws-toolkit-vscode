// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat

import software.aws.toolkits.resources.message

enum class StaticPrompt(
    val message: String,
) {
    Help("What can Amazon Q help me with?"),
    OnboardingHelp("What can Amazon Q do and what are some example questions?"),
    Transform(message("q.ui.prompt.transform")),
}
