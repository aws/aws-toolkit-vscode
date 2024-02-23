// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.dotnet

import com.intellij.openapi.module.Module
import com.intellij.psi.PsiElement
import com.jetbrains.rider.projectView.solutionDirectory
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import software.aws.toolkits.jetbrains.services.lambda.dotnet.element.RiderLambdaHandlerFakePsiElement
import software.aws.toolkits.resources.message
import java.nio.file.Path
import java.nio.file.Paths

class DotNetLambdaBuilder : LambdaBuilder() {
    override fun handlerBaseDirectory(module: Module, handlerElement: PsiElement): Path {
        val element = handlerElement as RiderLambdaHandlerFakePsiElement
        val projectFolder = element.getContainingProjectFile()?.parent?.path
            ?: throw IllegalStateException(message("lambda.run.configuration.handler_root_not_found"))
        return Paths.get(projectFolder)
    }

    override fun getBuildDirectory(module: Module): Path = Paths.get(module.project.solutionDirectory.path, ".aws-sam", "build")
}
