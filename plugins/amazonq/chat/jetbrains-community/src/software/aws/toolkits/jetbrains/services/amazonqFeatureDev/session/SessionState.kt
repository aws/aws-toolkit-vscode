// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

interface SessionState {
    val tabID: String
    val phase: SessionStatePhase?
    var approach: String
    suspend fun interact(action: SessionStateAction): SessionStateInteraction
}
