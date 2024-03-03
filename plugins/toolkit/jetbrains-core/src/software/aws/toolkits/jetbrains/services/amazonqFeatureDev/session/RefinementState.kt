// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.userMessageNotFound
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.generatePlan

class RefinementState(
    override var approach: String,
    override val tabID: String,
    val config: SessionStateConfig,
    val uploadId: String,
    private val currentIteration: Int
) : SessionState {
    override val phase = SessionStatePhase.APPROACH

    override suspend fun interact(action: SessionStateAction): SessionStateInteraction {
        if (action.msg.isEmpty()) {
            userMessageNotFound()
        }
        val approachResponse = generatePlan(config.proxyClient, config.conversationId, uploadId, action.msg, currentIteration)

        approach = approachResponse.approach

        val nextIteration = currentIteration + 1

        val nextState = RefinementState(approach, tabID, config, uploadId, nextIteration)
        val interaction = Interaction(content = "$approach\n", interactionSucceeded = approachResponse.succeededPlanning)
        return SessionStateInteraction(
            nextState = nextState,
            interaction = interaction
        )
    }
}
