// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.validation

import com.intellij.util.messages.Topic
import com.intellij.util.text.SemVer
import java.util.EventListener

/**
 * This class represents a topic for SAM CLI version validation events.
 */
interface SamCliVersionEvaluationListener : EventListener {
    companion object {
        val TOPIC = Topic("SAM CLI version evaluation listener", SamCliVersionEvaluationListener::class.java)
    }

    /**
     * SAM CLI version evaluation finished for the chosen profile, and it may be validated synchronously now.
     */
    fun samVersionValidationFinished(path: String, version: SemVer) {}
}
