// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.actions

import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.utils.TaggingResourceType
import software.aws.toolkits.resources.message

class DeleteFunctionAction : DeleteResourceAction<LambdaFunctionNode>(message("lambda.function.delete.action"), TaggingResourceType.LAMBDA_FUNCTION) {
    override fun performDelete(selected: LambdaFunctionNode) {
        val project = selected.nodeProject
        val selectedFunction = selected.value

        val client: LambdaClient = AwsClientManager.getInstance(project).getClient(
            credentialsProviderOverride = CredentialManager.getInstance().getCredentialProvider(selectedFunction.credentialProviderId),
            regionOverride = selectedFunction.region
        )

        client.deleteFunction { it.functionName(selected.functionName()) }
    }
}