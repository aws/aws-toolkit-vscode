// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package model.psi

import com.jetbrains.rd.generator.nova.Ext
import com.jetbrains.rd.generator.nova.ExternalGenerator
import com.jetbrains.rd.generator.nova.FlowTransform
import com.jetbrains.rd.generator.nova.GeneratorBase
import com.jetbrains.rd.generator.nova.PredefinedType.bool
import com.jetbrains.rd.generator.nova.PredefinedType.int
import com.jetbrains.rd.generator.nova.PredefinedType.string
import com.jetbrains.rd.generator.nova.PredefinedType.void
import com.jetbrains.rd.generator.nova.async
import com.jetbrains.rd.generator.nova.call
import com.jetbrains.rd.generator.nova.csharp.CSharp50Generator
import com.jetbrains.rd.generator.nova.doc
import com.jetbrains.rd.generator.nova.field
import com.jetbrains.rd.generator.nova.immutableList
import com.jetbrains.rd.generator.nova.kotlin.Kotlin11Generator
import com.jetbrains.rd.generator.nova.nullable
import com.jetbrains.rd.generator.nova.setting
import com.jetbrains.rd.generator.nova.util.syspropertyOrInvalid
import com.jetbrains.rider.model.nova.ide.IdeRoot
import com.jetbrains.rider.model.nova.ide.ShellModel.IconModel
import com.jetbrains.rider.model.nova.ide.SolutionModel
import java.io.File

object PsiKotlinGenerator : ExternalGenerator(
    Kotlin11Generator(
        FlowTransform.AsIs,
        "com.jetbrains.rider.model",
        File(syspropertyOrInvalid("ktPsiGeneratedOutput"))
    ),
    IdeRoot
)

object PsiCSharpGenerator : ExternalGenerator(
    CSharp50Generator(
        FlowTransform.Reversed,
        "JetBrains.Rider.Model",
        File(syspropertyOrInvalid("csPsiGeneratedOutput"))
    ),
    IdeRoot
)

@Suppress("unused")
object LambdaPsiModel : Ext(SolutionModel.Solution) {

    private val HandlerCompletionItem = structdef {
        field("handler", string)
        field("iconId", IconModel.nullable)
    }

    private val HandlerExistRequest = structdef {
        field("className", string)
        field("methodName", string)
        field("projectId", int)
    }

    init {
        setting(Kotlin11Generator.Namespace, "software.aws.toolkits.jetbrains.protocol")
        setting(CSharp50Generator.Namespace, "AWS.Toolkit.Rider.Model")

        setting(GeneratorBase.AcceptsGenerator) { generator ->
            generator == PsiKotlinGenerator.generator ||
                generator == PsiCSharpGenerator.generator
        }

        call("determineHandlers", void, immutableList(HandlerCompletionItem)).async
            .doc("Get collection of HandlerCompletionItems with available handler functions for a solution")

        call("isHandlerExists", HandlerExistRequest, bool).async
            .doc("Check whether handler with specified name exists for a partucular project")
    }
}
