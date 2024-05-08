// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

class ConversationNotStartedState(
    override var approach: String,
    override val tabID: String,
) : SessionState {
    override val phase = SessionStatePhase.INIT

    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
        error("Illegal transition between states, restart the conversation")
    }
}
