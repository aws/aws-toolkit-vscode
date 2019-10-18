// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.openapi.module.Module
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.dotnet.element.RiderLambdaHandlerFakePsiElement
import software.aws.toolkits.resources.message

class DotNetLambdaBuilder : LambdaBuilder() {

    override fun baseDirectory(module: Module, handlerElement: PsiElement): String {
        val element = handlerElement as RiderLambdaHandlerFakePsiElement
        return element.getContainingProjectFile()?.parent?.path
            ?: throw IllegalStateException(message("lambda.run.configuration.handler_root_not_found"))
    }
}
