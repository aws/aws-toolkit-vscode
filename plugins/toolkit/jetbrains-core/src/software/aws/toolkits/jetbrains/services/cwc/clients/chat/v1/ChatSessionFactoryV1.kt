// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.clients.chat.v1

import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.ChatSessionFactory

class ChatSessionFactoryV1 : ChatSessionFactory {
    override fun create(project: Project) = ChatSessionV1(project)
}
