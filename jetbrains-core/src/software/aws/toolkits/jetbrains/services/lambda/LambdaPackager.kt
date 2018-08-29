// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.openapi.extensions.ExtensionPointName
import com.intellij.openapi.module.Module
import com.intellij.psi.PsiFile
import software.amazon.awssdk.services.lambda.model.Runtime
import java.nio.file.Path
import java.util.concurrent.CompletionStage

interface LambdaPackager {
    /**
     * Creates a package for the given lambda including source files archived in the correct format.
     */
    fun createPackage(module: Module, file: PsiFile): CompletionStage<Path>

    /**
     * For a given [module] and [file] try to infer the Lambda language runtime
     */
    fun determineRuntime(module: Module, file: PsiFile): Runtime

    companion object : RuntimeGroupExtensionPointObject<LambdaPackager>(ExtensionPointName("aws.toolkit.lambda.packager"))
}