// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains

import com.intellij.openapi.util.registry.Registry

fun isDeveloperMode() = Registry.`is`("aws.toolkit.developerMode", false)
