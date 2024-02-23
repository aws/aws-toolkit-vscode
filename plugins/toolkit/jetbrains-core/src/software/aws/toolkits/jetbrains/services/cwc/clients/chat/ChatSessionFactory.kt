// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.clients.chat

import com.intellij.openapi.project.Project

interface ChatSessionFactory {
    fun create(project: Project): ChatSession
}
