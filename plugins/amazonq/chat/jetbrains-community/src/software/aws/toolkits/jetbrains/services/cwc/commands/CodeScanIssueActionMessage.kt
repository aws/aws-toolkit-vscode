// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.commands

import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage

data class CodeScanIssueActionMessage(val command: EditorContextCommand, val issue: MutableMap<String, String>) : AmazonQMessage
