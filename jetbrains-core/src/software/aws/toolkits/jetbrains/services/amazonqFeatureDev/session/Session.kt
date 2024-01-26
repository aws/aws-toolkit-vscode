// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.openapi.project.Project

class Session(val tabID: String, val project: Project) {
    private var state: SessionState?
    init {
        state = ConversationNotStartedState("", tabID)
    }
}
