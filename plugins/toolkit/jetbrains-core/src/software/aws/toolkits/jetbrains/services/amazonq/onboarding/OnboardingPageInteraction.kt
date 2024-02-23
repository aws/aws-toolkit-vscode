// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.onboarding

import com.fasterxml.jackson.annotation.JsonValue
import software.aws.toolkits.jetbrains.services.amazonq.messages.AmazonQMessage

enum class OnboardingPageInteractionType(
    @field:JsonValue val json: String
) {
    CwcButtonClick("onboarding-page-cwc-button-clicked"),
}

data class OnboardingPageInteraction(
    val type: OnboardingPageInteractionType,
) : AmazonQMessage
