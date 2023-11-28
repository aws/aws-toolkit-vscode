// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.util

import com.fasterxml.jackson.databind.JsonNode

val JsonNode.command
    get() = get("command").asText()

val JsonNode.tabType
    get() = get("tabType")?.asText()
