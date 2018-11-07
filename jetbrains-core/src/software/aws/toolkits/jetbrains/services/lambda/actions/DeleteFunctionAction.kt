// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import software.aws.toolkits.jetbrains.core.DeleteResourceAction
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.resources.message

class DeleteFunctionAction : DeleteResourceAction<LambdaFunctionNode>(message("lambda.function.delete.action")) {
    override fun performDelete(selected: LambdaFunctionNode) {
        selected.client.deleteFunction { it.functionName(selected.functionName()) }
    }
}