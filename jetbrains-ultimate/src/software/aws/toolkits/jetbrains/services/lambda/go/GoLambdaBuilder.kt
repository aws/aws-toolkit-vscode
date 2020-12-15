// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.go

import com.intellij.openapi.module.Module
import com.intellij.psi.PsiElement
import software.aws.toolkits.jetbrains.services.lambda.LambdaBuilder
import java.nio.file.Path

class GoLambdaBuilder : LambdaBuilder() {
    override fun handlerBaseDirectory(module: Module, handlerElement: PsiElement): Path {
        TODO("Not yet implemented")
    }
}
