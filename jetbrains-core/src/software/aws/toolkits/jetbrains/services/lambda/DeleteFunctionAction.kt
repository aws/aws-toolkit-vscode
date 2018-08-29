// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import software.aws.toolkits.jetbrains.core.DeleteResourceAction

class DeleteFunctionAction : DeleteResourceAction<LambdaFunctionNode>() {
    override fun performDelete(selected: LambdaFunctionNode) {
        selected.client.deleteFunction { it.functionName(selected.functionName()) }
    }
}