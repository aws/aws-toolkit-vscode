package software.aws.toolkits.jetbrains.services.lambda

import software.aws.toolkits.jetbrains.core.DeleteResourceAction

class DeleteFunctionAction : DeleteResourceAction<LambdaFunctionNode>() {
    override fun performDelete(selected: LambdaFunctionNode) {
        selected.client.deleteFunction { it.functionName(selected.functionName()) }
    }
}