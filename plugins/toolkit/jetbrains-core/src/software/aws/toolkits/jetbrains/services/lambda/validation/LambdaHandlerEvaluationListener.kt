// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.validation

import com.intellij.util.messages.Topic
import java.util.EventListener

/**
 * This class represents a topic for Lambda Handler validation events.
 */
interface LambdaHandlerEvaluationListener : EventListener {
    companion object {
        val TOPIC = Topic("Lambda handler evaluation listener", LambdaHandlerEvaluationListener::class.java)
    }

    /**
     * Lambda handler evaluation finished for the chosen profile, and it may be validated synchronously now.
     */
    fun handlerValidationFinished(handlerName: String, isHandlerExists: Boolean) {}
}
